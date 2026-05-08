// registers and attaches source buffers;
// manages their state;
// provides API for adding and removing content from buffer
// ^^ Seems like plenty of responsibility for one module (avoid the temptation to do too much in buffer)
export namespace BufferManager {
  export type Type = {
    state: null; // todo define
  };
  export const make = (): Type => {
    return { state: null };
  };
}
