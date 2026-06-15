FROM python:3.12-slim

ARG HERMES_AGENT_REF=95715dcb03003eab086eb0494083e6dc1c65f3b3

# Node 20+ for the Hermes WhatsApp bridge's current Baileys dependency.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg git \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

# Install Hermes from the official source and include its bundled WhatsApp bridge.
# The pip package does not currently install scripts/whatsapp-bridge, but
# `hermes whatsapp` and the gateway resolve it from the installed package root.
RUN git clone --depth 1 https://github.com/nousresearch/hermes-agent.git /tmp/hermes-agent \
 && cd /tmp/hermes-agent \
 && git fetch --depth 1 origin "$HERMES_AGENT_REF" \
 && git checkout "$HERMES_AGENT_REF" \
 && pip install --no-cache-dir /tmp/hermes-agent \
 && mkdir -p /usr/local/lib/python3.12/site-packages/scripts \
 && cp -R /tmp/hermes-agent/scripts/whatsapp-bridge /usr/local/lib/python3.12/site-packages/scripts/ \
 && rm -rf /tmp/hermes-agent

WORKDIR /root/.hermes
COPY SOUL.md /root/.hermes/SOUL.md
COPY skills/ /root/.hermes/skills/

EXPOSE 8642
CMD ["hermes", "gateway"]
