FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git gcc musl-dev

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o newshell-server .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/newshell-server .

ENV NEWSHELL_PORT=29800
ENV NEWSHELL_DATA_DIR=/data

EXPOSE 29800

VOLUME /data

CMD ["./newshell-server"]
