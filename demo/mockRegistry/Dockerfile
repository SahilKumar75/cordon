ARG NODE_IMAGE
FROM ${NODE_IMAGE}
WORKDIR /registry
COPY poisonedPackage/dist poisonedPackage/dist
COPY mockRegistry/server.js mockRegistry/server.js
RUN mkdir mockRegistry/storage && chown node mockRegistry/storage
ENV HOST=0.0.0.0 MOCK_REGISTRY_PORT=4873
USER node
CMD ["node", "mockRegistry/server.js"]
