FROM node:lts-alpine AS builder
WORKDIR /app

COPY . .

RUN npm install
RUN npm run build

FROM scratch AS exporter
COPY --from=builder /app/dist /
