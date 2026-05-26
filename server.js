const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  },
  maxHttpBufferSize: 20 * 1024 * 1024
});

const PORT = process.env.PORT || 3000;





/* =========================
   SECURITY
========================= */

app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'", "blob:"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    }
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

app.use(express.json({
  limit: '1mb'
}));





/* =========================
   STATIC
========================= */

app.use(express.static('public'));

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.use('/uploads', express.static('uploads'));





/* =========================
   DATABASE
========================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log('MongoDB connected');
})
.catch((err) => {
  console.error(err);
});





/* =========================
   MODELS
========================= */

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





/* =========================
   SANITIZE
========================= */

function clean(input = '') {

  return sanitizeHtml(
    String(input),
    {
      allowedTags: [],
      allowedAttributes: {}
    }
  )
  .replace(/\s+/g, ' ')
  .trim();
}





/* =========================
   FILE UPLOAD
========================= */

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, 'uploads');
  },

  filename: (req, file, cb) => {

    const safeExt = path.extname(file.originalname)
      .toLowerCase();

    cb(
      null,
      Date.now() + '-' +
      Math.random()
      .toString(36)
      .slice(2) + safeExt
    );
  }
});

const allowedMimeTypes = [

  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',

  'video/mp4',
  'video/webm',
  'video/ogg'
];

const upload = multer({

  storage,

  limits: {
    fileSize: 20 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    if (
      !allowedMimeTypes.includes(
        file.mimetype
      )
    ) {

      return cb(
        new Error('허용되지 않은 파일')
      );
    }

    cb(null, true);
  }
});





/* =========================
   ROOMS
========================= */

app.get('/rooms', async (req, res) => {

  try {

    const rooms = await Room.find()
      .limit(100);

    res.json(rooms);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: '서버 오류'
    });
  }
});





app.post('/create-room', async (req, res) => {

  try {

    const name = clean(req.body.name)
      .slice(0, 50);

    const owner = clean(req.body.owner)
      .slice(0, 30);

    const password = clean(
      req.body.password || ''
    ).slice(0, 50);

    if (!name) {

      return res.status(400).json({
        error: '방 이름 필요'
      });
    }

    const room = {

      id: Date.now(),

      name,

      owner,

      password
    };

    await Room.create(room);

    res.json(room);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: '서버 오류'
    });
  }
});





app.post('/verify-room', async (req, res) => {

  try {

    const room = await Room.findOne({
      id: Number(req.body.roomId)
    });

    if (!room) {

      return res.json({
        success: false,
        message: '방 없음'
      });
    }

    const password = clean(
      req.body.password || ''
    );

    if (
      !room.password ||
      room.password === password
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

    console.error(err);

    res.status(500).json({
      error: '서버 오류'
    });
  }
});





/* =========================
   UPLOAD
========================= */

app.post(
  '/upload',
  upload.single('file'),
  (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({
          error: '파일 없음'
        });
      }

      res.json({
        url: '/uploads/' + req.file.filename
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: '업로드 실패'
      });
    }
  }
);





/* =========================
   SOCKET SECURITY
========================= */

const userMessageCooldown = new Map();

function isSpam(socketId) {

  const now = Date.now();

  const last =
    userMessageCooldown.get(socketId) || 0;

  if (now - last < 700) {
    return true;
  }

  userMessageCooldown.set(socketId, now);

  return false;
}





/* =========================
   SOCKET
========================= */

io.on('connection', (socket) => {

  console.log('유저 접속');





  socket.on(
    'joinRoom',
    async ({ roomId, nickname }) => {

      try {

        roomId = String(roomId);

        nickname = clean(
          nickname || '익명'
        ).slice(0, 30);

        socket.join(roomId);

        const messages =
          await Message.find({
            roomId
          })
          .sort({ createdAt: 1 })
          .limit(200);

        socket.emit(
          'loadMessages',
          messages
        );

        io.to(roomId).emit(
          'systemMessage',
          {
            message:
              `${nickname} 입장`
          }
        );

      } catch (err) {

        console.error(err);
      }
    }
  );





  socket.on(
    'chatMessage',
    async (data) => {

      try {

        if (isSpam(socket.id)) {
          return;
        }

        const roomId = clean(
          data.roomId
        ).slice(0, 100);

        const nickname = clean(
          data.nickname || '익명'
        ).slice(0, 30);

        const message = clean(
          data.message ||
          data.text ||
          ''
        ).slice(0, 1000);

        if (!message) {
          return;
        }

        const msgData = {

          roomId,

          nickname,

          message
        };

        await Message.create(msgData);

        io.to(roomId).emit(
          'chatMessage',
          msgData
        );

      } catch (err) {

        console.error(err);
      }
    }
  );





  socket.on('disconnect', () => {

    userMessageCooldown.delete(
      socket.id
    );

    console.log('유저 퇴장');
  });
});





/* =========================
   ERROR HANDLER
========================= */

app.use((err, req, res, next) => {

  console.error(err);

  res.status(500).json({
    error: '서버 오류'
  });
});





/* =========================
   START
========================= */

server.listen(PORT, () => {

  console.log(
    `Server running on ${PORT}`
  );
});
