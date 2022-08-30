# THAT gateway Dockerfile

FROM node:16-alpine

# Create and change to app directory
WORKDIR /usr/src/that

# Copy build artifacts into image
COPY __build__ ./

# install production node_modules
# set-script prepare '' removes Husky from prepare. Docker/node16 bug
RUN npm pkg delete scripts.prepare \
  && npm install --omit=dev

CMD [ "npm", "start" ]
