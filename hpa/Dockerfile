# Commands are run in a specific order so that commands that result in the most frequent changes are done last.
# This reduces the deploy payload.
FROM node:7.10.0

# Make the app run in production mode.
ENV NODE_ENV production

WORKDIR /app

# Set up NPM environment for private packages
COPY package.json /app/
RUN npm install --production --quiet

COPY index.js /app/
CMD ["node","index.js"]
