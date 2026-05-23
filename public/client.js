const socket = io();

let currentRoom = null;

const nicknameInput =
  document.getElementById('nickname');

nicknameInput.value =
  localStorage.getItem('nickname') || '';

function saveNickname() {

  localStorage.setItem(
    'nickname',
    nicknameInput.value
  );
}

function changeNickname() {

  localStorage.removeItem('nickname');

  location.reload();
}

async function loadRooms() {

  const res = await fetch('/rooms');

  const rooms = await res.json();

  const ul =
    document.getElementById('roomList');

  ul.innerHTML = '';

  rooms.forEach(room => {

    const li =
      document.createElement('li');

    li.innerHTML = `
      ${room.name} by ${room.owner}
      <button onclick="joinRoom(${room.id})">
        입장
      </button>
    `;

    ul.appendChild(li);
  });
}

async function createRoom() {

  const name =
    document.getElementById(
      'roomName'
    ).value;

  const password =
    document.getElementById(
      'privateCheck'
    ).checked
      ? document.getElementById(
          'roomPassword'
        ).value
      : '';

  const res = await fetch(
    '/create-room',
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json'
      },

      body: JSON.stringify({
        name,
        owner: nicknameInput.value,
        password
      })
    }
  );

  const room = await res.json();

  loadRooms();

  joinRoom(room.id);
}

async function joinRoom(roomId) {

  const roomsRes =
    await fetch('/rooms');

  const rooms =
    await roomsRes.json();

  const room =
    rooms.find(r => r.id == roomId);

  if (!room) {

    alert('방이 존재하지 않습니다.');

    return;
  }

  if (room.password) {

    const inputPassword =
      prompt('비밀번호를 입력하세요');

    if (inputPassword === null)
      return;

    const verifyRes =
      await fetch('/verify-room', {

        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body: JSON.stringify({
          roomId,
          password: inputPassword
        })
      });

    const verify =
      await verifyRes.json();

    if (!verify.success) {

      alert(verify.message);

      return;
    }
  }

  currentRoom = roomId;

  localStorage.setItem(
    'lastRoom',
    roomId
  );

  document.getElementById(
    'currentRoom'
  ).innerText = `방: ${roomId}`;

  socket.emit('joinRoom', {
    roomId,
    nickname: nicknameInput.value
  });
}

function appendMessage(text) {

  const div =
    document.createElement('div');

  div.innerHTML = text;

  document
    .getElementById('chat')
    .appendChild(div);

  document.getElementById(
    'chat'
  ).scrollTop =
    document.getElementById(
      'chat'
    ).scrollHeight;
}

function renderFileMessage(
  nickname,
  file
) {

  // 이미지/GIF
  if (
    file.type.startsWith('image/')
  ) {

    appendMessage(`
      <b>${nickname}</b><br>

      <img
        src="${file.url}"
        class="preview"
      >
    `);

  // 동영상
  } else if (
    file.type.startsWith('video/')
  ) {

    appendMessage(`
      <b>${nickname}</b><br>

      <video
        controls
        class="preview-video"
      >
        <source
          src="${file.url}"
          type="${file.type}"
        >
      </video>
    `);

  } else {

    appendMessage(`
      <b>${nickname}</b><br>

      <a
        href="${file.url}"
        target="_blank"
      >
        ${file.original}
      </a>
    `);
  }
}

function sendMessage() {

  const input =
    document.getElementById(
      'message'
    );

  if (!input.value.trim())
    return;

  socket.emit('chatMessage', {
    roomId: currentRoom,
    nickname: nicknameInput.value,
    message: input.value
  });

  input.value = '';
}

document
  .getElementById('message')
  .addEventListener(
    'keydown',
    (e) => {

      if (e.key === 'Enter') {
        sendMessage();
      }
    }
  );

socket.on(
  'chatMessage',
  (data) => {

    if (data.file) {

      renderFileMessage(
        data.nickname,
        data.file
      );

    } else {

      appendMessage(`
        <b>${data.nickname}</b>:
        ${data.message}
      `);
    }
  }
);

socket.on(
  'systemMessage',
  (data) => {

    appendMessage(`
      <i>${data.text}</i>
    `);
  }
);

socket.on(
  'userList',
  (users) => {

    document.getElementById(
      'users'
    ).innerHTML =
      users.join('<br>');
  }
);

socket.on(
  'loadMessages',
  (messages) => {

    document.getElementById(
      'chat'
    ).innerHTML = '';

    messages.forEach(msg => {

      if (msg.file) {

        renderFileMessage(
          msg.nickname,
          msg.file
        );

      } else {

        appendMessage(`
          <b>${msg.nickname}</b>:
          ${msg.message}
        `);
      }
    });
  }
);

async function uploadFile() {

  const file =
    document.getElementById(
      'fileInput'
    ).files[0];

  if (!file) {

    alert('파일 선택');

    return;
  }

  const form =
    new FormData();

  form.append('file', file);

  try {

    const res =
      await fetch('/upload', {

        method: 'POST',

        body: form
      });

    const data =
      await res.json();

    socket.emit('chatMessage', {

      roomId: currentRoom,

      nickname:
        nicknameInput.value,

      file: {
        url: data.url,
        type: data.type,
        original: data.original
      }
    });

  } catch (err) {

    console.error(err);

    alert('업로드 실패');
  }
}

loadRooms();

const lastRoom =
  localStorage.getItem('lastRoom');

if (lastRoom) {

  setTimeout(() => {

    joinRoom(lastRoom);

  }, 500);
}
