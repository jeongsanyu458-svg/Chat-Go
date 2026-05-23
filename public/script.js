
function saveNickname() {
  const input = document.querySelector('input');
  localStorage.setItem('nickname', input.value);
  alert('닉네임 저장 완료');
}

function createRoom() {
  alert('방 생성 기능 연결됨');
}
