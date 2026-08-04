# tjstats CORS 代理 — 服务器部署

## 背景

Toy 页面是 `https://www.bilibili.com/...`，浏览器会**阻止 HTTPS 页面请求 HTTP 接口**（混合内容拦截），所以这个代理必须挂在 HTTPS 域名下，不能跑裸 HTTP。

另外 `open.tjstats.com` 会拦截海外云厂商的出口 IP（Cloudflare 边缘、AWS、Vercel、阿里云新加坡都被拦过），但**国内云厂商的 IP（比如阿里云杭州）实测是通的**——不需要专门用家庭宽带中转，一台普通的国内 VPS 就够。

HTTPS 证书不需要买域名：用 [nip.io](https://nip.io) 这种通配符 DNS 服务（`1-2-3-4.nip.io` 自动解析到 `1.2.3.4`），配合 Caddy 自动申请 Let's Encrypt 证书，全程免费、不用备案。

## 部署步骤（以 Ubuntu 为例）

假设你能 SSH 到服务器（root 权限）：

```bash
# 1. 装 Node.js —— 小内存 VPS（1GB 以下）不要用 apt install，dpkg 解包大包容易 OOM，
#    严重时会把 sshd 一起拖死。改用官方二进制包直接解压。
cd /tmp
curl -fsSL -o node.tar.xz https://mirrors.aliyun.com/nodejs-release/v20.20.2/node-v20.20.2-linux-x64.tar.xz
mkdir -p /usr/local/lib/nodejs
tar -xJf node.tar.xz -C /usr/local/lib/nodejs
ln -sf /usr/local/lib/nodejs/node-v20.20.2-linux-x64/bin/node /usr/local/bin/node
ln -sf /usr/local/lib/nodejs/node-v20.20.2-linux-x64/bin/npm /usr/local/bin/npm

# 如果内存小于 1GB，顺手加个 swap，避免后续任何操作 OOM：
fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 2. 把 proxy.js 传到服务器上（从你自己电脑执行）
scp proxy.js root@你的服务器IP:/opt/tjstats-proxy.cjs

# 3. 用 systemd 常驻，监听本地 8787 端口
cat > /etc/systemd/system/tjstats-proxy.service <<'EOF'
[Unit]
Description=tjstats CORS proxy
After=network.target

[Service]
Environment=PORT=8787
ExecStart=/usr/local/bin/node /opt/tjstats-proxy.cjs
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now tjstats-proxy

# 4. 装 Caddy —— 同样避免用 apt（会拉一个大 deb 触发同样的 OOM 风险），
#    直接下载官方静态二进制。注意这个下载接口返回的就是裸二进制，不是压缩包。
curl -fsSL -o /usr/local/bin/caddy 'https://caddyserver.com/api/download?os=linux&arch=amd64'
chmod +x /usr/local/bin/caddy

# 5. 配置 Caddy，用 nip.io 自动签发 HTTPS 证书，反代到本地 8787
#    把 IP_WITH_DASHES 换成你服务器公网 IP，用短横线代替点号，比如 1.2.3.4 -> 1-2-3-4
mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile <<'EOF'
IP_WITH_DASHES.nip.io {
    reverse_proxy localhost:8787
}
EOF

cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy
After=network.target

[Service]
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
LimitNPROC=512
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE
User=root

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now caddy
```

几秒钟后 Caddy 会自动签好证书。测试：

```bash
curl "https://IP_WITH_DASHES.nip.io/match-auth-app/open/v1/schedule/stage?seasonId=237" \
  -H "Authorization: 7935be4c41d8760a28c05581a7b1f570"
```

能拿到 JSON 数据就说明通了，把这个地址填到 [`src/config.ts`](../src/config.ts) 里生产环境的 `API_BASE_URL`。

当前生产环境用的就是这套方案：`https://120-27-149-43.nip.io`（阿里云杭州）。

## 如果没有 pm2/root 权限，或者是宝塔/1Panel 这类面板服务器

告诉我服务器情况（面板类型、有没有 Node 环境），再给对应的图形化操作步骤。
