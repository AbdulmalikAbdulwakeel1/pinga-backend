let _io = null;

const setIo = (io) => { _io = io; };
const getIo = () => _io;

const emitToRoom = (room, event, data) => {
  if (_io) _io.to(room).emit(event, data);
};

module.exports = { setIo, getIo, emitToRoom };
