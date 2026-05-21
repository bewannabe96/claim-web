# infra/aligo-proxy

알리고 SMS / LMS / 알림톡 API IP whitelist 통과용 고정 IP 프록시. Lightsail 인스턴스
1대 + 고정 IP + Caddy(TLS auto) + 작은 Node forward proxy.

## 아키텍처

```
Vercel (Server Action / src/server/aligo.ts)
    │  POST https://<proxy-host>/aligo/{send,alimtalk/send,template/list}/
    │  Authorization: Bearer <PROXY_SHARED_SECRET>
    │  Content-Type: application/x-www-form-urlencoded
    │  body: key=...&user_id=...&sender=...&receiver=...&msg=...
    ▼
Lightsail (Seoul, 고정 IP — 알리고 콘솔에 등록)
    │  Caddy :443 (Let's Encrypt 자동) → Node :8080
    │  ① Bearer secret 검증
    │  ② path 기반 upstream 라우팅
    ▼
SMS/LMS     : /aligo/send/          → https://apis.aligo.in/send/
알림톡 발송 : /aligo/alimtalk/send/ → https://kakaoapi.aligo.in/akv10/alimtalk/send/
템플릿 조회 : /aligo/template/list/ → https://kakaoapi.aligo.in/akv10/template/list/
```

알리고는 SMS/LMS (`apis.aligo.in`) 와 카카오 — 알림톡 발송 + 검수 템플릿 조회 —
(`kakaoapi.aligo.in` + `/akv10` prefix) 의 호스트/경로가 다르므로, 프록시가
`/aligo/{alimtalk,template}/*` 를 별도 호스트로 분기해 매핑한다. 클라이언트는 양쪽
모두 동일한 `/aligo/...` prefix 로 호출.

프록시는 **인증 + 경로 매핑만** 책임. 요청/응답 바디 무수정 패스 →
`ALIGO_KEY`/`USER_ID`/`SENDER`/`KAKAO_SENDER_KEY` 는 Vercel env 그대로 유지, 코드 변경 최소.

## 비용 (Seoul 기준)

| 항목 | 월 |
|---|---|
| `micro_3_0` 인스턴스 (1GB / 2vCPU / 40GB / 2TB transfer) | ~$10 |
| 고정 IP (인스턴스 attach 중엔 무료) | $0 |
| 데이터 전송 (OTP SMS + 알림톡 트래픽은 무시 가능) | $0 |
| **합계** | **~$10** |

스냅샷 백업은 별도 (~$0.05/GB·월). Lightsail 콘솔에서 켜기.

## 셋업

### 사전 준비

- AWS 계정 + Lightsail 권한 (`AWSLightsailFullAccess` 또는 동등)
- AWS credential 로컬 설정 (`aws configure` 또는 `AWS_PROFILE` env)
- terraform >= 1.6
- SSH 키 페어: `ssh-keygen -t ed25519 -f ~/.ssh/aligo-proxy`
- (선택) 도메인 — 없으면 `<static-ip>.nip.io` 자동 사용

### Apply

```bash
cd infra/aligo-proxy
cp terraform.tfvars.example terraform.tfvars
# ssh_public_key_path 필수 입력, allowed_ssh_cidrs 권장 입력
terraform init
terraform apply
```

apply 후 5~10분 부트스트랩 (Node + Caddy apt 설치) 진행. 그 다음 Caddy LE 발급에 추가 1~2분.

헬스체크 (보통 ~7분 후):
```bash
curl $(terraform output -raw proxy_url)/healthz
# → ok
```

진행 상태나 부트스트랩 로그를 들여다보고 싶으면 [운영 섹션의 SSH 접속 안내](#-ssh-접속--현재-상태) 따라 임시 cert 로 들어간 후:

```bash
sudo tail -f /var/log/aligo-proxy-bootstrap.log   # [bootstrap] done 까지 진행
systemctl status aligo-proxy caddy --no-pager     # 둘 다 active
```

## Vercel 측 연동

### 1. 알리고 콘솔 IP 등록

알리고 → SMS API → 사용 IP 등록에 `terraform output -raw static_ip` 값 추가.

### 2. Vercel 환경변수

```bash
ALIGO_PROXY_URL=<terraform output -raw proxy_url>
ALIGO_PROXY_SECRET=<terraform output -raw shared_secret>
```

### 3. `src/server/aligo.ts` 동작 (참고)

이미 프록시 옵션이 코드에 내장돼 있어 별도 수정 불필요. 위 두 env 만 채우면 자동으로 프록시 경로 (`$ALIGO_PROXY_URL/aligo/send/` + `Authorization: Bearer ...`) 로 라우팅됩니다.

- env 둘 다 비움 → 알리고 직접 호출 (로컬 dev / test mode 용)
- `ALIGO_PROXY_URL` 만 채우고 `ALIGO_PROXY_SECRET` 누락 → `EnvSchema` 가 throw (zod refine)
- 둘 다 채움 → 프록시 경유

응답은 알리고 원본을 그대로 패스스루 → 호출자의 `AligoResponseSchema` 변경 불필요.

## 운영

### ⚠ SSH 접속 — 현재 상태

`aws_lightsail_key_pair` 로 등록한 키 (`~/.ssh/aligo-proxy`) 가 인스턴스에서 인증 실패하는 미해결 이슈가 있습니다 (OS 의 `authorized_keys` 와 Lightsail SSH CA 시스템 충돌 의심, 원인 미규명). **현재 SSH 는 Lightsail 임시 cert 로만 가능**:

```bash
# 임시 SSH cert 발급 (15분 유효)
aws lightsail get-instance-access-details \
  --instance-name aligo-proxy-instance --region ap-northeast-2 --output json > /tmp/ls-access.json
python3 -c "
import json
d=json.load(open('/tmp/ls-access.json'))['accessDetails']
open('/tmp/ls-key','w').write(d['privateKey'])
open('/tmp/ls-key-cert.pub','w').write(d['certKey'])"
chmod 600 /tmp/ls-key /tmp/ls-key-cert.pub

# 접속
ssh -i /tmp/ls-key -o CertificateFile=/tmp/ls-key-cert.pub \
    ubuntu@$(terraform output -raw static_ip)
```

이하 안내에서 "`ssh ...`" 라고 적힌 부분은 위 cert 옵션을 붙여 호출해야 합니다.

### 코드 변경 배포

`proxy/server.mjs` 수정 후 — **현재는 `terraform apply` 만 사용 가능** (SSH 가 정상화되면 rsync 직배포 옵션 부활):

```bash
terraform apply  # user_data 의 server.mjs 가 file() 로 inline 됨 → diff → instance recreate
```

다운타임 ~5분 (인스턴스 재생성 + 부트스트랩). 코드 변경 빈도가 낮으면 충분. 잦은 배포가 필요해지면 SSH 키 이슈 먼저 해결 → rsync 옵션 복원.

### 로그

위 임시 cert 셋업이 끝났다고 가정:

```bash
SSH_OPTS="-i /tmp/ls-key -o CertificateFile=/tmp/ls-key-cert.pub"
HOST=ubuntu@$(terraform output -raw static_ip)

# 프록시 stdout
ssh $SSH_OPTS $HOST 'sudo journalctl -u aligo-proxy -f'

# Caddy 접근 로그
ssh $SSH_OPTS $HOST 'sudo tail -f /var/log/caddy/access.log'

# Caddy 자체 로그 (LE 발급 등)
ssh $SSH_OPTS $HOST 'sudo journalctl -u caddy -f'
```

### 모니터링 (필수)

`<proxy-url>/healthz` → 200 `ok`. UptimeRobot / Better Stack / Pingdom 등에서
1분 간격 + Slack/이메일 알림. 프록시 죽으면 SMS OTP + 알림톡 발송이 모두 막힘
(본인인증 차단 + 파트너/가입자 사용자 알림 — 신규 배정 / 연락 요청 / 분석 완료 — 전부 미전송).

### 백업

Lightsail 콘솔 → 인스턴스 → Snapshots → Enable automatic snapshots. ~$0.05/GB·월.
terraform 관리 외 (state 없음).

## 보안 주의

- **SSH 22 default = `0.0.0.0/0`.** 운영에선 `allowed_ssh_cidrs = ["<your-ip>/32"]` 강력 권장.
- `PROXY_SHARED_SECRET` 은 `/etc/aligo-proxy.env` (root 0600) 에 저장. **terraform state 에도 포함됨**
  → state 파일 보호 (S3 backend + KMS 암호화 권장). 현재는 local state.
- Caddy 가 80/443 둘 다 사용 (ACME HTTP-01 challenge). 둘 다 `0.0.0.0/0` open.
- 프록시는 알리고 자격을 모름. `ALIGO_KEY` 누출 책임은 Vercel env 보호.

## state 백엔드

기본 local state. 팀 공유 시 S3 backend:

```hcl
# versions.tf 에 추가
terraform {
  backend "s3" {
    bucket = "<your-tf-state-bucket>"
    key    = "claim-web/aligo-proxy.tfstate"
    region = "ap-northeast-2"
    encrypt = true
  }
}
```

## Destroy

```bash
terraform destroy
```

고정 IP 가 detach 되어 시간당 과금으로 전환되므로 release 가 깔끔. `random_password` 리소스가
새로 생성되므로 다음 apply 시 secret 도 새로 발급 — Vercel env 도 갱신 필요.

## 비고

- **nip.io 의존성**: nip.io 가 죽으면 도메인 해석 안 됨. 운영은 자체 도메인 권장.
- **Caddy LE 발급**: 첫 부팅 후 인증서 발급에 1~2분. 502 떨어질 수 있음 — 정상.
- **알리고 응답 패스스루**: `result_code` 등 응답 형식 변화 없음. 호출자 (`src/server/aligo.ts`) 의 `AligoResponseSchema` 변경 불필요.
- **single instance**: SPOF. HA 가 필요한 트래픽 규모가 되면 ALB + 2-instance 로 진화. MVP 에선 healthz + 알림으로 충분.
