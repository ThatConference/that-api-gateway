# THAT gateway Dockerfile

FROM node:12-alpine

# Create and change to app directory
WORKDIR /usr/src/that

# Copy build artifacts into image
COPY __build__/* ./
COPY package* ./
# COPY node_modules/* ./node_modules/
RUN npm install --production

CMD [ "node", "index.js" ]
