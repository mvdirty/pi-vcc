import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export const registerPiVccCommand = (pi: ExtensionAPI) => {
  pi.registerCommand("pi-vcc", {
    description: "Compact conversation with pi-vcc structured summary",
    handler: async (_args, ctx) => {
      ctx.compact();
      ctx.ui.notify("Compacted with pi-vcc", "info");
    },
  });
};
