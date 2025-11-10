FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
# Copy source files
COPY app ./app
COPY components ./components
COPY *.config.js ./
COPY *.json ./
COPY tsconfig.json ./
# Create public directory if it doesn't exist
RUN mkdir -p ./public
# Create production next.config.js without output: export BEFORE build
RUN rm -f next.config.js && cat > next.config.js << 'EOFCONFIG'
/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  swcMinify: true,
}
module.exports = nextConfig
EOFCONFIG
RUN cat next.config.js
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3005
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/app ./app
RUN mkdir -p ./public && ([ -d /app/public ] && cp -r /app/public/* ./public/ || true)
EXPOSE 3005
CMD ["npm", "start"]


