FROM node:24-bookworm-slim AS frontend
WORKDIR /app/whiteboard-app
COPY whiteboard-app/package*.json ./
RUN npm ci
COPY whiteboard-app/ ./
RUN npm run build

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production PORT=3500 HOST=0.0.0.0 DATA_DIR=/data
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/server.js ./
COPY backend/src ./src
COPY --from=frontend /app/whiteboard-app/dist /app/whiteboard-app/dist
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3500
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
