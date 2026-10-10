FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS web
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM golang:1.27.2-alpine3.24@sha256:f92b6ef800e499660581efdabdf25d9d817a9d124eaf900924f0504e7e27e12d AS go
WORKDIR /build
COPY go.mod *.go ./
ARG TARGETOS=linux
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /gateway .

FROM alpine:3.23.5@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40
WORKDIR /app
COPY --from=go /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=go /gateway /app/cursor-gateway
COPY --from=web /build/dist /app/web
RUN addgroup -g 10001 gateway && adduser -D -u 10001 -G gateway gateway && mkdir /app/data && chown gateway:gateway /app/data
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:3000/health || exit 1
ENTRYPOINT ["/app/cursor-gateway"]
