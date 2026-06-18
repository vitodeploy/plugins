// Deterministic ZIP writer: fixed entry order (callers sort), epoch mtimes, and
// "stored" (uncompressed) entries. Identical input bytes -> identical zip bytes
// -> identical sha256, so re-running pack/publish on an unchanged plugin is a
// no-op the marketplace can dedupe by name@version + sha256.
import { crc32 } from "./crc32.mjs";

const DOS_EPOCH_TIME = 0;
const DOS_EPOCH_DATE = (1 << 5) | 1; // 1980-01-01, the DOS epoch

function toLocalHeader(entry) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt16LE(DOS_EPOCH_TIME, 10);
  header.writeUInt16LE(DOS_EPOCH_DATE, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.compressedSize, 18);
  header.writeUInt32LE(entry.uncompressedSize, 22);
  header.writeUInt16LE(entry.nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, entry.nameBuffer]);
}

function toCentralHeader(entry) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(DOS_EPOCH_TIME, 12);
  header.writeUInt16LE(DOS_EPOCH_DATE, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.uncompressedSize, 24);
  header.writeUInt16LE(entry.nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([header, entry.nameBuffer]);
}

export function buildZip(files) {
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const localParts = [];
  const entries = [];
  let offset = 0;

  for (const file of sorted) {
    const nameBuffer = Buffer.from(file.name, "utf8");
    const uncompressed = file.data;
    const entry = {
      nameBuffer,
      method: 0, // stored
      crc: crc32(uncompressed),
      compressedSize: uncompressed.length,
      uncompressedSize: uncompressed.length,
      offset,
    };
    const local = toLocalHeader(entry);
    localParts.push(local, uncompressed);
    offset += local.length + uncompressed.length;
    entries.push(entry);
  }

  const central = entries.map(toCentralHeader);
  const centralSize = central.reduce((sum, buf) => sum + buf.length, 0);
  const centralOffset = offset;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...central, end]);
}
