import tty from "tty"
import stream, { Stream } from "stream"

export const collectLogs = (dockerStream: any) => {
  let currentChunk = Buffer.from('');
  let stdOutAndStdErr: Buffer = Buffer.from('');
  const attachStream = new stream.Writable({
    write: function (chunk: Buffer, encoding, next) {
      //header := [8]byte{STREAM_TYPE, 0, 0, 0, SIZE1, SIZE2, SIZE3, SIZE4}
      currentChunk = Buffer.concat([currentChunk, chunk]);
      //const isStdOut = currentChunk.readInt8() === 0x01;
      //const isStdErr = currentChunk.readInt8() === 0x02;
      const payloadSize: number = currentChunk.readUInt32BE(4);

      while (currentChunk.byteLength >= 8 + payloadSize) {
        stdOutAndStdErr = Buffer.concat([stdOutAndStdErr, currentChunk.slice(8, 8 + payloadSize)]);
        currentChunk = currentChunk.slice(8 + payloadSize);
      }
      next();
    },
  });
  
  return new Promise((resolve, reject) => {
    dockerStream.on('end', () => {
      resolve(currentChunk)
    })
  })
}

export const attachStdOut = (stdout: any, dockerStream: any, modem: any, onResize: any) => {
  if (stdout instanceof Array) {
    dockerStream.on('end', function () {
      try {
        stdout[0].end();
      } catch (e) { }
      try {
        stdout[1].end();
      } catch (e) { }
    });
    modem.demuxStream(dockerStream, stdout[0], stdout[1]);
  } else {
    dockerStream.setEncoding('utf8');
    dockerStream.pipe(stdout, {
      end: true
    });
  }

  stdout.on('resize', onResize);

}

export const detachStdout = (stdout: any, onResize: any) => {
  stdout.removeListener('resize', onResize);
}

export const attachStdin = (stdin: tty.ReadStream, dockerStream: any) => {
  stdin.setEncoding('utf8');
  stdin.setRawMode(true);
  stdin.pipe(dockerStream); // stdin -> flow mode
}

export const detachStdin = (stdin: tty.ReadStream, wasRaw: boolean) => {
  stdin.removeAllListeners();
  stdin.setRawMode(wasRaw);
  // The stdin stream is paused by default
  stdin.pause();
  // @ts-ignore
  // https://stackoverflow.com/questions/26004519/why-doesnt-my-node-js-process-terminate-once-all-listeners-have-been-removed/26004758
  // console.log('handles', process._getActiveHandles())
  stdin.unref()
}