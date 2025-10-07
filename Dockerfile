# 构建阶段
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制依赖清单
COPY package.json package-lock.json ./

# 安装依赖
RUN npm ci

# 复制全部源代码
COPY . .

# 构建前端
RUN npm run build

# 运行阶段
FROM node:20-alpine AS runner

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production

# 复制依赖
COPY --from=builder /app/package.json /app/package-lock.json ./

# 仅安装生产依赖
RUN npm ci --omit=dev

# 拷贝前端
COPY --from=builder /app/dist ./dist

# 拷贝后端
COPY --from=builder /app/server ./server

# 暴露端口
EXPOSE 3000

# 启动后端
CMD ["node", "server/index.js"]


