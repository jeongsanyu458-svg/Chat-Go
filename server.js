const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB 연결 성공');
  })
  .catch(err => {
    console.log(err);
  });

const roomSchema = new mongoose.Schema({
  id: Number,
  name: String,
  owner: String,
  password: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Room = mongoose.model('Room', roomSchema);

const messageSchema = new mongoose.Schema({
  roomId: String,
  nickname: String,
  text: String,
  image: String,
  type: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Message = mongoose.model('Message', messageSchema);

app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads');
  },

  filename: (req, file, cb) => {
    cb(
      null,
      Date.now() + path.extname(file.originalname)
    );
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 100
  }
});

app.get('/rooms', async (req, res) => {

  const rooms = await Room.find().sort({ createdAt: -1 });

  res.json(rooms);
});

app.post('/create-room', async (req, res) => {

  const room = await Room.create({
    id: Date.now(),
    name: req.body.name,
    owner: req.body.owner,
    password: req.body.password || ''
  });

  res.json(room);
});

app.post('/verify-room', async (req, res) => {

  const room = await Room.findOne({
    id: req.body.roomId
  });

  if (!room) {

    return res.json({
      success: false,
      message: '방이 존재하지 않습니다.'
    });
  }

  if (!room.password) {

    return res.json({
      success: true
    });
  }

  if (room.password === req.body.password) {

    return res.json({
      success: true
    });
  }

  res.json({
    success: false,
    message: '비밀번호가 틀렸습니다.'
  });
});

app.post(
  '/upload',
  upload.single('file'),
  (req, res) => {

    if (!req.file) {

      return res.status(400).json({
        error: '파일 없음'
      });
    }

    res.json({
      url: '/uploads/' + req.file.filename,
      type: req.file.mimetype,
      original: req.file.originalname
    });
  }
);

const roomUsers = {};

io.on('connection', (socket) => {

  socket.on(
    'joinRoom',
    async ({ roomId, nickname }) => {

      socket.join(roomId);

      socket.roomId = roomId;
      socket.nickname = nickname;

      if (!roomUsers[roomId]) {
        roomUsers[roomId] = [];
      }

      roomUsers[roomId] =
        roomUsers[roomId].filter(
          user => user.socketId !== socket.id
        );

      roomUsers[roomId].push({
        socketId: socket.id,
        nickname
      });

      const uniqueUsers = [
        ...new Set(
          roomUsers[roomId].map(
            user => user.nickname
          )
        )
      ];

      const messages = await Message.find({
        roomId
      }).sort({ createdAt: 1 });

      io.to(roomId).emit(
        'systemMessage',
        {
          text: `${nickname}님이 입장했습니다.`
        }
      );

      io.to(roomId).emit(
        'userList',
        uniqueUsers
      );

      socket.emit(
        'loadMessages',
        messages
      );
    }
  );

  socket.on('chatMessage', async (data) => {

    await Message.create({
      roomId: data.roomId,
      nickname: data.nickname,
      text: data.text || '',
      image: data.image || '',
      type: data.type || 'text'
    });

    io.to(data.roomId).emit(
      'chatMessage',
      data
    );
  });

  socket.on('disconnect', () => {

    const roomId = socket.roomId;

    if (
      !roomId ||
      !roomUsers[roomId]
    ) return;

    roomUsers[roomId] =
      roomUsers[roomId].filter(
        user =>
          user.socketId !== socket.id
      );

    const uniqueUsers = [
      ...new Set(
        roomUsers[roomId].map(
          user => user.nickname
        )
      )
    ];

    io.to(roomId).emit(
      'systemMessage',
      {
        text: `${socket.nickname}님이 퇴장했습니다.`
      }
    );

    io.to(roomId).emit(
      'userList',
      uniqueUsers
    );
  });
});

server.listen(PORT, () => {
  console.log(
    'Korea Chat Go Server running'
  );
});