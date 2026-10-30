import { describe, expect, it } from "vitest";
import { checkProfile, dockerfileOf, profileHash, profileTag } from "./profiles";

describe("image profiles", () => {
  it("builds on the base image with its package manager, one RUN per command", () => {
    const { profile } = checkProfile({ id: "ubuntu-red", name: "Ubuntu con red", base: "ubuntu", packages: "iproute2, iputils-ping\ntraceroute", setup: "echo hola > /etc/motd", startup: "echo listo" });
    expect(profile).not.toBeNull();
    const dockerfile = dockerfileOf(profile!);
    expect(dockerfile).toMatch(/^FROM ubuntu:24\.04\n/);
    expect(dockerfile).toContain("apt-get install -y --no-install-recommends iproute2 iputils-ping traceroute");
    expect(dockerfile).toContain("RUN echo hola > /etc/motd");
    expect(dockerfile).toContain(`visual-tracert.profile-hash="${profileHash(profile!)}"`);
    expect(profileTag("ubuntu-red")).toBe("visual-tracert/profile-ubuntu-red:latest");
    // what runs at the start does not change the image
    expect(profileHash({ ...profile!, startup: [] })).toBe(profileHash(profile!));
    expect(dockerfileOf({ ...profile!, base: "frr", packages: ["tcpdump"] })).toContain("RUN apk add --no-cache tcpdump");
  });

  it("refuses ids, packages and bases that would not build", () => {
    const { problems } = checkProfile({ id: "Mal Id", name: "", base: "windows", packages: "ok; rm -rf /" });
    expect(problems.join("\n")).toMatch(/minúsculas/);
    expect(problems.join("\n")).toMatch(/nombre/);
    expect(problems.join("\n")).toMatch(/"windows" no existe/);
    expect(problems.join("\n")).toMatch(/no válidos: ok;/);
    expect(checkProfile({ id: "bb", name: "BB", base: "busybox", packages: "curl" }).problems.join("")).toMatch(/no tiene gestor de paquetes/);
  });
});
