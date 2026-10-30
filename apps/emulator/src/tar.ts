// A tar archive with a few small files: the build context of a profile (its
// Dockerfile), as Docker's build endpoint takes it.
function header(name: string, size: number): Buffer {
  const block = Buffer.alloc(512);
  const field = (text: string, offset: number, length: number) => block.write(text, offset, length, "ascii");
  const octal = (value: number, length: number) => value.toString(8).padStart(length - 1, "0") + "\0";
  field(name, 0, 100);
  field(octal(0o644, 8), 100, 8);
  field(octal(0, 8), 108, 8);
  field(octal(0, 8), 116, 8);
  field(octal(size, 12), 124, 12);
  field(octal(Math.floor(Date.now() / 1000), 12), 136, 12);
  field("        ", 148, 8);
  field("0", 156, 1);
  field("ustar\0", 257, 6);
  field("00", 263, 2);
  // the checksum: the sum of the header's bytes, with its own field as spaces
  const sum = block.reduce((total, byte) => total + byte, 0);
  field(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return block;
}

export function tar(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  for(const [name, text] of Object.entries(files)){
    const data = Buffer.from(text, "utf8");
    parts.push(header(name, data.length), data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}
