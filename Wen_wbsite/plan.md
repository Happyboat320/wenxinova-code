# 文心新述：公网 IP HTTPS 改造计划

## 1. 目标与架构

为固定公网 IP **8.134.215.157** 启用浏览器可信的 HTTPS，不使用自签名证书。

~~~text
浏览器 https://8.134.215.157
            ↓
         Nginx :443
            ↓
 Express 127.0.0.1:5000
~~~

完成标准：

- HTTP 自动跳转 HTTPS，浏览器无证书警告。
- 前端继续通过同源 /api 调用后端。
- Refresh Cookie 启用 Secure。
- 公网不再直接开放 5000 端口。
- Let’s Encrypt IP 短期证书自动续期，续期后 Nginx 自动加载。

## 2. 实施前提

- 8.134.215.157 是绑定到当前服务器的固定公网 IP/EIP。
- 阿里云安全组开放 TCP 80、443，并保留管理所需的 22。
- 公网访问 80 端口确实能到达这台服务器。
- 80/443 未被其他未知服务占用。
- 使用支持 --ip-address 的新版 Certbot。
- 准备一个有效邮箱接收证书异常通知。

先核查：

~~~bash
curl -4 https://api.ipify.org
sudo ss -ltnp | grep -E ':(80|443|5000)[[:space:]]'
sudo nginx -v
certbot --version
certbot --help all | grep -E 'ip-address|preferred-profile'
~~~

如果服务器位于 NAT 后，系统内显示内网地址是正常现象，但必须在阿里云控制台确认 EIP 已绑定，且公网 80 端口能转发至本机。

## 3. 备份与基线检查

~~~bash
cd /root/wenxin/Wen_wbsite

sudo cp backend/.env /root/wenxin/backend.env.before-https
sudo cp -a /etc/nginx /root/wenxin/nginx.before-https
sudo chmod 600 /root/wenxin/backend.env.before-https

curl -fsS http://127.0.0.1:5000/health
npm --prefix backend run build
npm --prefix frontend run build
~~~

同时记录安全组原始规则、服务状态和原访问地址。

## 4. 安装 Nginx 与新版 Certbot

~~~bash
sudo apt update
sudo apt install -y nginx snapd
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
~~~

确认 Snap 版支持 IP 地址证书：

~~~bash
/snap/bin/certbot --version
/snap/bin/certbot --help all | grep -E 'ip-address|preferred-profile'
~~~

只有帮助中存在 --ip-address 才继续。不要因客户端版本过旧而改用自签名证书。

## 5. 建立 HTTP 与 ACME 验证入口

~~~bash
sudo mkdir -p /var/www/certbot/.well-known/acme-challenge
sudo chown -R www-data:www-data /var/www/certbot
~~~

新建 /etc/nginx/sites-available/wenxin，第一阶段只启用 HTTP：

~~~nginx
server {
    listen 80;
    listen [::]:80;
    server_name 8.134.215.157;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type text/plain;
    }

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 130s;
    }
}
~~~

启用前先检查已有配置，避免与默认站点冲突：

~~~bash
sudo nginx -T
sudo ln -s /etc/nginx/sites-available/wenxin /etc/nginx/sites-enabled/wenxin
sudo nginx -t
sudo systemctl enable --now nginx
~~~

若链接已存在则不要重复创建；默认站点是否停用必须根据 nginx -T 的结果决定。

验证公网 ACME 路径：

~~~bash
echo acme-ok | sudo tee /var/www/certbot/.well-known/acme-challenge/check
curl -fsS http://127.0.0.1/.well-known/acme-challenge/check -H 'Host: 8.134.215.157'
curl -fsS http://8.134.215.157/.well-known/acme-challenge/check
~~~

两次均返回 acme-ok 后再申请证书。

## 6. 申请公网 IP 证书

Let’s Encrypt IP 地址证书是公共 CA 证书，但有效期约 160 小时。将邮箱替换为真实邮箱：

~~~bash
sudo /snap/bin/certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --preferred-profile shortlived \
  --ip-address 8.134.215.157 \
  --email YOUR_EMAIL@example.com \
  --agree-tos \
  --no-eff-email
~~~

核验证书：

~~~bash
sudo /snap/bin/certbot certificates
sudo openssl x509 \
  -in /etc/letsencrypt/live/8.134.215.157/fullchain.pem \
  -noout -subject -issuer -dates -ext subjectAltName
~~~

必须确认：

- Issuer 是受信任 CA，不是服务器自身。
- SAN 包含 IP Address:8.134.215.157。
- 证书处于有效期内。
- 如果 Certbot 生成了带 -0001 等后缀的目录，Nginx 必须使用实际路径。

## 7. 启用 Nginx HTTPS

证书签发后，将站点配置调整为：

~~~nginx
server {
    listen 80;
    listen [::]:80;
    server_name 8.134.215.157;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type text/plain;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name 8.134.215.157;

    ssl_certificate /etc/letsencrypt/live/8.134.215.157/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/8.134.215.157/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 130s;
        proxy_send_timeout 130s;
    }
}
~~~

首次上线不启用 HSTS，避免 HTTPS 或续期有误时浏览器被长期锁定。稳定运行后再评估。

~~~bash
sudo nginx -t
sudo systemctl reload nginx
~~~

## 8. 修改项目环境变量

修改 backend/.env：

~~~env
AUTH_COOKIE_SECURE="true"
AUTH_COOKIE_DOMAIN=""
CORS_ORIGINS="https://8.134.215.157"
TRUST_PROXY="true"
~~~

注意：

- IP 访问时 AUTH_COOKIE_DOMAIN 保持空值，使用 Host-only Cookie。
- CORS_ORIGINS 不带路径，也不写默认的 :443。
- 生产前端继续使用相对地址 /api。
- frontend/.env.development 仅用于本地开发，不影响生产构建。

应用配置：

~~~bash
sudo chmod 600 /root/wenxin/Wen_wbsite/backend/.env
cd /root/wenxin/Wen_wbsite/backend
npm run build
sudo systemctl restart wenxin
curl -fsS http://127.0.0.1:5000/health
~~~

## 9. 自动续期

IP 证书约 6 天半到期，自动续期不能省略：

~~~bash
sudo systemctl list-timers --all | grep -E 'certbot|snap.certbot'
sudo systemctl status snap.certbot.renew.timer
~~~

创建续期成功后的 Nginx reload hook：

~~~bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null <<'EOF'
#!/bin/sh
nginx -t && systemctl reload nginx
EOF
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
~~~

测试续期：

~~~bash
sudo /snap/bin/certbot renew --dry-run
~~~

建议每天监控证书剩余时间，并在不足 48 小时时告警：

~~~bash
openssl s_client -connect 8.134.215.157:443 </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates
~~~

## 10. 安全组收口

HTTPS 完全验证后：

- TCP 22：仅允许可信管理 IP。
- TCP 80：保留 HTTP 跳转和 ACME HTTP-01 验证。
- TCP 443：对外提供 HTTPS。
- TCP 5000：删除公网放行规则。

Node.js 即使仍监听 0.0.0.0:5000，安全组也必须阻止公网直连，Nginx 只通过 127.0.0.1:5000 访问。

## 11. 上线验收

~~~bash
curl -I http://8.134.215.157
curl -I https://8.134.215.157
curl -fsS https://8.134.215.157/health
curl -fsS https://8.134.215.157/api/books

openssl s_client \
  -connect 8.134.215.157:443 \
  -verify_return_error </dev/null
~~~

验收标准：

- HTTP 返回 301，目标为 https://8.134.215.157。
- HTTPS 页面正常，主流浏览器无证书警告。
- /health 与 /api/books 正常。
- 短信发送、登录、Token 刷新和退出完整走通。
- Refresh Cookie 包含 HttpOnly、Secure、SameSite=Lax。
- 非白名单 Origin 被拒绝。
- 公网无法访问 8.134.215.157:5000。
- Certbot 自动续期定时任务为 active。

## 12. 回滚

若 HTTPS 上线后无法访问：

1. 临时恢复安全组原有的 5000 规则。
2. 恢复备份环境变量和 Nginx 配置。
3. 重启后端，停止故障的 Nginx 入口。

~~~bash
sudo cp /root/wenxin/backend.env.before-https /root/wenxin/Wen_wbsite/backend/.env
sudo systemctl restart wenxin
sudo systemctl stop nginx
curl -fsS http://8.134.215.157:5000/health
~~~

回滚时不要删除 /etc/letsencrypt 中的证书与账户数据，修复后仍可继续使用。

## 13. 推荐实施顺序

1. 确认 EIP、安全组和端口。
2. 备份环境变量与 Nginx。
3. 安装新版 Certbot 和 Nginx。
4. 建立并验证 HTTP ACME 入口。
5. 申请并核验 IP 证书。
6. 启用 Nginx HTTPS。
7. 修改 Cookie、CORS 与代理变量。
8. 重启后端并完成业务验收。
9. 验证自动续期。
10. 关闭公网 5000。
11. 稳定运行后再评估 HSTS。

只有证书签发、HTTPS 业务验证和自动续期三项全部通过，才算改造完成。
