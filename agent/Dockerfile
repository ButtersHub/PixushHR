FROM python:3.12-slim

# Node 18+ for the Hermes WhatsApp bridge
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg git \
 && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

# Install Hermes (pin a version at integration time)
RUN pip install --no-cache-dir hermes-agent

WORKDIR /root/.hermes
COPY SOUL.md /root/.hermes/SOUL.md
COPY skills/ /root/.hermes/skills/

EXPOSE 8642
CMD ["hermes", "gateway"]
