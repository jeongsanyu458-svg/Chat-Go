const socket = io();

let currentRoom = null;

const nicknameInput =
  document.getElementById('nickname');

nicknameInput.value =
  localStorage.getItem('nickname') || '';





/* =========================
   UTILS
========================= */

function safeText(text = '') {

  return String(text)
    .replace(/\s+/g, ' ')
    .trim();
}

function safeURL(url = '') {

  if (
    typeof url !== 'string'
  ) {
    return '';
  }

  if (
    url.startsWith('/uploads/')
  ) {
    return url;
  }

  return '';
}





/* =========================
   NICKNAME
========================= */

function saveNickname() {

  const nickname =
    safeText(nicknameInput.value)
    .slice(0, 30);

  nicknameInput.value =
    nickname;

  localStorage.setItem(
    'nickname',
    nickname
  );
}

function changeNickname() {

  localStorage.removeItem(
    'nickname'
  );

  location.reload();
}





/* =========================
   ROOM LIST
========================= */

async function loadRooms() {

  try {

    const res =
      await fetch('/rooms');

    const rooms =
      await res.json();

    const ul =
      document.getElementById(
        'roomList'
      );

    ul.innerHTML = '';

    rooms.forEach(room => {

      const li =
        document.createElement('li');

      const text =
        document.createTextNode(
          `${safeText(room.name)} by ${safeText(room.owner)} `
        );

      const button =
        document.createElement(
          'button'
        );

      button.textContent =
        '입장';

      button.onclick = () => {
        joinRoom(room.id);
      };

      li.appendChild(text);

      li.appendChild(button);

      ul.appendChild(li);
    });

  } catch (err) {

    console.error(err);

    alert('방 목록 불러오기 실패');
  }
}





/* =========================
   CREATE ROOM
========================= */

async function createRoom() {

  try {

    const name =
      safeText(
        document.getElementById(
          'roomName'
        ).value
      ).slice(0, 50);

    if (!name) {

      alert('방 이름 입력');

      return;
    }

    const password =
      document.getElementById(
        'privateCheck'
      ).checked

      ? safeText(
          document.getElementById(
            'roomPassword'
          ).value
        ).slice(0, 50)

      : '';

    const res =
      await fetch(
        '/create-room',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({

            name,

            owner:
              safeText(
                nicknameInput.value
              ).slice(0, 30),

            password
          })
        }
      );

    const room =
      await res.json();

    loadRooms();

    joinRoom(room.id);

  } catch (err) {

    console.error(err);

    alert('방 생성 실패');
  }
}





/* =========================
   JOIN ROOM
========================= */

async function joinRoom(roomId) {

  try {

    const roomsRes =
      await fetch('/rooms');

    const rooms =
      await roomsRes.json();

    const room =
      rooms.find(
        r => r.id == roomId
      );

    if (!room) {

      alert(
        '방이 존재하지 않습니다.'
      );

      return;
    }

    if (room.password) {

      const inputPassword =
        prompt(
          '비밀번호 입력'
        );

      if (
        inputPassword === null
      ) {
        return;
      }

      const verifyRes =
        await fetch(
          '/verify-room',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({

              roomId,

              password:
                safeText(
                  inputPassword
                )
            })
          }
        );

      const verify =
        await verifyRes.json();

      if (!verify.success) {

        alert(
          verify.message
        );

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
    ).textContent =
      `방: ${roomId}`;

    socket.emit(
      'joinRoom',
      {
        roomId,

        nickname:
          safeText(
            nicknameInput.value
          ).slice(0, 30)
      }
    );

  } catch (err) {

    console.error(err);

    alert('방 입장 실패');
  }
}





/* =========================
   MESSAGE RENDER
========================= */

function appendMessage({

  nickname = '',

  message = '',

  system = false

}) {

  const chat =
    document.getElementById(
      'chat'
    );

  const div =
    document.createElement(
      'div'
    );

  if (system) {

    const i =
      document.createElement(
        'i'
      );

    i.textContent =
      safeText(message);

    div.appendChild(i);

  } else {

    const b =
      document.createElement(
        'b'
      );

    b.textContent =
      safeText(nickname) + ': ';

    const span =
      document.createElement(
        'span'
      );

    span.textContent =
      safeText(message);

    div.appendChild(b);

    div.appendChild(span);
  }

  chat.appendChild(div);

  chat.scrollTop =
    chat.scrollHeight;
}





/* =========================
   FILE RENDER
========================= */

function renderFileMessage(
  nickname,
  file
) {

  const chat =
    document.getElementById(
      'chat'
    );

  const wrap =
    document.createElement(
      'div'
    );

  const name =
    document.createElement(
      'b'
    );

  name.textContent =
    safeText(nickname);

  wrap.appendChild(name);

  wrap.appendChild(
    document.createElement('br')
  );

  const fileURL =
    safeURL(file.url);

  if (!fileURL) {
    return;
  }

  // IMAGE
  if (
    file.type &&
    file.type.startsWith(
      'image/'
    )
  ) {

    const img =
      document.createElement(
        'img'
      );

    img.src = fileURL;

    img.className =
      'preview';

    img.loading = 'lazy';

    wrap.appendChild(img);

  // VIDEO
  } else if (

    file.type &&
    file.type.startsWith(
      'video/'
    )

  ) {

    const video =
      document.createElement(
        'video'
      );

    video.controls = true;

    video.className =
      'preview-video';

    video.src = fileURL;

    wrap.appendChild(video);

  // OTHER
  } else {

    const a =
      document.createElement(
        'a'
      );

    a.href = fileURL;

    a.target = '_blank';

    a.rel =
      'noopener noreferrer';

    a.textContent =
      safeText(
        file.original ||
        '파일'
      );

    wrap.appendChild(a);
  }

  chat.appendChild(wrap);

  chat.scrollTop =
    chat.scrollHeight;
}





/* =========================
   SEND MESSAGE
========================= */

function sendMessage() {

  if (!currentRoom) {

    alert('방 입장 필요');

    return;
  }

  const input =
    document.getElementById(
      'message'
    );

  const message =
    safeText(input.value)
    .slice(0, 1000);

  if (!message) {
    return;
  }

  socket.emit(
    'chatMessage',
    {
      roomId: currentRoom,

      nickname:
        safeText(
          nicknameInput.value
        ).slice(0, 30),

      message
    }
  );

  input.value = '';
}





/* =========================
   ENTER KEY
========================= */

document
  .getElementById('message')
  .addEventListener(
    'keydown',
    (e) => {

      if (e.key === 'Enter') {

        e.preventDefault();

        sendMessage();
      }
    }
  );





/* =========================
   SOCKET EVENTS
========================= */

socket.on(
  'chatMessage',
  (data) => {

    if (data.file) {

      renderFileMessage(
        data.nickname,
        data.file
      );

    } else {

      appendMessage({
        nickname:
          data.nickname,

        message:
          data.message
      });
    }
  }
);





socket.on(
  'systemMessage',
  (data) => {

    appendMessage({

      message:
        data.message ||
        '시스템 메시지',

      system: true
    });
  }
);





socket.on(
  'userList',
  (users) => {

    const usersBox =
      document.getElementById(
        'users'
      );

    usersBox.innerHTML = '';

    users.forEach(user => {

      const div =
        document.createElement(
          'div'
        );

      div.textContent =
        safeText(user);

      usersBox.appendChild(div);
    });
  }
);





socket.on(
  'loadMessages',
  (messages) => {

    const chat =
      document.getElementById(
        'chat'
      );

    chat.innerHTML = '';

    messages.forEach(msg => {

      if (msg.file) {

        renderFileMessage(
          msg.nickname,
          msg.file
        );

      } else {

        appendMessage({

          nickname:
            msg.nickname,

          message:
            msg.message
        });
      }
    });
  }
);





/* =========================
   FILE UPLOAD
========================= */

async function uploadFile() {

  if (!currentRoom) {

    alert('방 입장 필요');

    return;
  }

  const file =
    document.getElementById(
      'fileInput'
    ).files[0];

  if (!file) {

    alert('파일 선택');

    return;
  }

  const allowed = [

    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',

    'video/mp4',
    'video/webm',
    'video/ogg'
  ];

  if (
    !allowed.includes(
      file.type
    )
  ) {

    alert(
      '허용되지 않은 파일'
    );

    return;
  }

  if (
    file.size >
    20 * 1024 * 1024
  ) {

    alert(
      '20MB 이하만 가능'
    );

    return;
  }

  const form =
    new FormData();

  form.append(
    'file',
    file
  );

  try {

    const res =
      await fetch(
        '/upload',
        {
          method: 'POST',
          body: form
        }
      );

    const data =
      await res.json();

    if (!data.url) {

      alert('업로드 실패');

      return;
    }

    socket.emit(
      'chatMessage',
      {

        roomId:
          currentRoom,

        nickname:
          safeText(
            nicknameInput.value
          ).slice(0, 30),

        file: {

          url: data.url,

          type:
            file.type,

          original:
            file.name
        }
      }
    );

  } catch (err) {

    console.error(err);

    alert('업로드 실패');
  }
}





/* =========================
   INIT
========================= */

loadRooms();

const lastRoom =
  localStorage.getItem(
    'lastRoom'
  );

if (lastRoom) {

  setTimeout(() => {

    joinRoom(lastRoom);

  }, 500);
}
/* =========================
   GLOBAL FUNCTIONS
========================= */

window.loadRooms =
  loadRooms;

window.createRoom =
  createRoom;

window.joinRoom =
  joinRoom;

window.sendMessage =
  sendMessage;

window.uploadFile =
  uploadFile;

window.saveNickname =
  saveNickname;

window.changeNickname =
  changeNickname;
