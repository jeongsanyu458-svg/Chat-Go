const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

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
  storage
});

console.log("MONGO URI:");
console.log(process.env.MONGO_URI);

mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("MongoDB connected");
})
.catch(err => {
  console.log("MONGO ERROR:");
  console.log(err);
});

const Room = mongoose.model(
  'Room',
  new mongoose.Schema({
    id: Number,
    name: String,
    owner: String,
    password: String
  })
);

const Message = mongoose.model(
  'Message',
  new mongoose.Schema({
    roomId: String,
    nickname: String,
    message: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  })
);

app.get('/rooms', async (req, res) => {

  try {

    const rooms = await Room.find();

    res.json(rooms);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: err.message
    });
  }
});

app.post('/create-room', async (req, res) => {

  try {

    const room = {
      id: Date.now(),
      name: req.body.name,
      owner: req.body.owner,
      password: req.body.password || ''
    };

    await Room.create(room);

    res.json(room);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: err.message
    });
  }
});

app.post('/verify-room', async (req, res) => {

  try {

    const room = await Room.findOne({
      id: req.body.roomId
    });

    if (!room) {

      return res.json({
        success: false,
        message: '방이 없음'
      });
    }

    if (
      !room.password ||
      room.password === req.body.password
    ) {

      return res.json({
        success: true
      });
    }

    res.json({
      success: false,
      message: '비밀번호 틀림'
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: err.message
    });
  }
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
      url: '/uploads/' + req.file.filename
    });
  }
);

io.on('connection', (socket) => {

  console.log('유저 접속');

  socket.on(
    'joinRoom',
    async ({ roomId, nickname }) => {

      socket.join(roomId);

      const messages = await Message.find({
        roomId: String(roomId)
      });

      socket.emit(
        'loadMessages',
        messages
      );

      io.to(roomId).emit(
        'systemMessage',
        {
          message: `${nickname} 입장`
        }
      );
    }
  );

  socket.on(
    'chatMessage',
    async (data) => {

      await Message.create({
        roomId: String(data.roomId),
        nickname: data.nickname,
        message: data.message
      });

      io.to(data.roomId).emit(
        'chatMessage',
        data
      );
    }
  );
});

server.listen(PORT, () => {

  console.log(
    `Server running on ${PORT}`
  );
});
