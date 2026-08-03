# tjstats CORS 代理 — 国内服务器部署

## 重要前提:必须有 HTTPS

Toy 页面本身是 `https://www.bilibili.com/...`，浏览器会**阻止 HTTPS 页面请求 HTTP 接口**（混合内容拦截）。所以这个代理不能只跑裸 HTTP，必须挂在 HTTPS 域名下。

这意味着你需要：

1. 一台国内 Linux VPS（阿里云/腾讯云等），有公网 IP。
2. 一个**域名**，把 A 记录指向这台服务器的公网 IP（子域名即可，比如 `proxy.你的域名.com`）。国内服务器绑定域名做 web 服务通常还需要**备案**——如果暂时没有备案域名，可以先用境外注册的域名（不走大陆机房的 CDN/证书环节一般不强制备案，具体看你服务器所在机房要求）。

如果这一步对你来说门槛太高，告诉我，我们再想别的办法（比如用服务商自带的 SSL 证书 + 面板配置）。

## 部署步骤

假设你能 SSH 到服务器（Ubuntu/Debian 系，其他发行版命令换成对应包管理器）：

```bash
# 1. 装 Node.js（如果还没有）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 装 pm2（保活进程用）
sudo npm install -g pm2

# 3. 把 proxy.js 传到服务器上（用 scp，从你自己电脑执行）
scp proxy.js root@你的服务器IP:/opt/tjstats-proxy.js

# 4. 在服务器上用 pm2 启动，监听本地 8787 端口
pm2 start /opt/tjstats-proxy.js --name tjstats-proxy
pm2 save
pm2 startup   # 按提示配置开机自启

# 5. 装 Caddy（自动申请/续期 HTTPS 证书，比 nginx+certbot 省事很多）
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

# 6. 配置 Caddy 反代到本地 8787，自动签发证书
sudo tee /etc/caddy/Caddyfile <<'EOF'
proxy.你的域名.com {
    reverse_proxy localhost:8787
}
EOF
sudo systemctl restart caddy
```

几秒钟后 Caddy 会自动签好证书。测试：

```bash
curl "https://proxy.你的域名.com/match-auth-app/open/v1/schedule/stage?seasonId=237" \
  -H "Authorization: 7935be4c41d8760a28c05581a7b1f570"
```

能拿到 JSON 数据就说明通了。把 `https://proxy.你的域名.com` 发给我，我去把 `src/config.ts` 里生产环境的 `API_BASE_URL` 改成指向它。

## 如果没有 pm2/root 权限，或者是宝塔/1Panel 这类面板服务器

告诉我服务器情况（面板类型、有没有 Node 环境），我再给对应的图形化操作步骤。
