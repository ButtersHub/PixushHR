import { describe, it, expect } from "vitest";
import { z } from "zod";
import { TOOLS } from "../src/tools.js";

describe("ToolDef metadata", () => {
  it("every tool has a kind, label and connector", () => {
    for (const [name, def] of Object.entries(TOOLS)) {
      expect(def.kind, `${name} missing kind`).toBeDefined();
      expect(["engine-tool", "external-hermes"]).toContain(def.kind);
      expect(def.label, `${name} missing label`).toBeTruthy();
      expect(def.connector, `${name} missing connector`).toBeTruthy();
    }
  });

  it("existing wired tools are engine-tool kind", () => {
    expect(TOOLS["hris.upsert_employee"].kind).toBe("engine-tool");
    expect(TOOLS["ats.get_contract"].kind).toBe("engine-tool");
    expect(TOOLS["teams.add_member"].kind).toBe("engine-tool");
    expect(TOOLS["channel.send_message"].kind).toBe("engine-tool");
    expect(TOOLS["document.generate_termination_letter"].kind).toBe("engine-tool");
    expect(TOOLS["workflow.activate_offboarding"].kind).toBe("engine-tool");
  });

  it("wired tools declare an outputShape", () => {
    expect(TOOLS["ats.get_contract"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["hris.upsert_employee"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["teams.add_member"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["calendar.create_invite"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["content.get_branding"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["channel.send_message"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["hiring_manager.ask"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["document.generate_termination_letter"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["workflow.activate_offboarding"].outputShape).toBeInstanceOf(z.ZodObject);
  });

  it("registers gmail.send_email + whatsapp.send_message virtual tools", () => {
    expect(TOOLS["gmail.send_email"]).toBeDefined();
    expect(TOOLS["whatsapp.send_message"]).toBeDefined();
  });

  it("virtual tools have kind=external-hermes and no run", () => {
    expect(TOOLS["gmail.send_email"].kind).toBe("external-hermes");
    expect(TOOLS["gmail.send_email"].run).toBeUndefined();
    expect(TOOLS["whatsapp.send_message"].kind).toBe("external-hermes");
    expect(TOOLS["whatsapp.send_message"].run).toBeUndefined();
  });

  it("virtual tools carry their own connector ids and Channels role-port", () => {
    expect(TOOLS["gmail.send_email"].connector).toBe("gmail");
    expect(TOOLS["whatsapp.send_message"].connector).toBe("whatsapp");
    expect(TOOLS["gmail.send_email"].integration).toBe("Channels");
    expect(TOOLS["whatsapp.send_message"].integration).toBe("Channels");
  });

  it("connector ids match real connector definitions", () => {
    expect(TOOLS["hris.upsert_employee"].connector).toBe("shapes");
    expect(TOOLS["ats.get_contract"].connector).toBe("comeet");
    expect(TOOLS["hiring_manager.ask"].connector).toBe("teams");
    expect(TOOLS["teams.add_member"].connector).toBe("teams");
    expect(TOOLS["calendar.create_invite"].connector).toBe("calendar");
    expect(TOOLS["content.get_branding"].connector).toBe("branding");
    expect(TOOLS["channel.send_message"].connector).toBe("teams");
    expect(TOOLS["document.generate_termination_letter"].connector).toBe("branding");
    expect(TOOLS["workflow.activate_offboarding"].connector).toBe("shapes");
  });
});
