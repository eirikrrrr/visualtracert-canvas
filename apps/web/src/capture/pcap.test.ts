import { describe, expect, it } from "vitest";
import { hexDump, PcapReader } from "./pcap";

const bytes = (text: string) => Uint8Array.from(text.replace(/\s+/g, "").match(/../g)!.map(pair => parseInt(pair, 16)));
// little-endian pcap header: Ethernet, microseconds
const HEADER = bytes("d4c3b2a1 0200 0400 00000000 00000000 00000400 01000000");
const record = (seconds: number, frame: Uint8Array) => {
  const head = new DataView(new ArrayBuffer(16));
  head.setUint32(0, seconds, true); head.setUint32(4, 500000, true);
  head.setUint32(8, frame.length, true); head.setUint32(12, frame.length, true);
  return new Uint8Array([...new Uint8Array(head.buffer), ...frame]);
};
// an ICMP echo request 10.1.0.10 → 10.2.0.10, and an ARP request
const PING = bytes("020000000201 020000000203 0800 4500 0054 1234 4000 40 01 0000 0a01000a 0a02000a 08 00 0000 0007 0001" + "00".repeat(56));
const ARP = bytes("ffffffffffff 020000000203 0806 0001 0800 06 04 0001 020000000203 0a01000a 000000000000 0a010001" + "00".repeat(18));

describe("pcap", () => {
  it("decodes packets as they arrive, even split in two", () => {
    const reader = new PcapReader();
    const all = new Uint8Array([...HEADER, ...record(100, PING), ...record(101, ARP)]);
    const first = reader.push(all.subarray(0, 60));
    const rest = reader.push(all.subarray(60));
    const packets = [...first, ...rest];
    expect(packets).toHaveLength(2);
    expect(packets[0]).toMatchObject({ index: 1, protocol: "ICMP", src: "10.1.0.10", dst: "10.2.0.10", time: 0 });
    expect(packets[0].info).toMatch(/^Echo \(ping\) request {2}id=0x0007, seq=1, ttl=64/);
    expect(packets[1]).toMatchObject({ protocol: "ARP", info: "Who has 10.1.0.1? Tell 10.1.0.10", time: 1 });
    expect(packets[1].layers[0].fields).toContainEqual(["Origen", "02:00:00:00:02:03"]);
  });

  it("dumps bytes as offset, hex and text", () => {
    expect(hexDump(bytes("48656c6c6f"))).toBe("0000  48 65 6c 6c 6f" + " ".repeat(33) + "  Hello");
  });
});
