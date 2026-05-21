# infra/content-bucket

서비스 컨텐츠 (이미지/사진 등) 전용 S3 버킷 + IAM. 설계서/제안서 같은 "문서" 버킷
(`S3_BUCKET_PROPOSALS`) 과는 분리된 별도 버킷.

## 버킷 명명 — AWS 권장 namespace 패턴

```
<account_id>-<region>-<namespace>
예: 123456789012-ap-northeast-2-claim-content-prod
```

`namespace` 변수만 입력 — terraform 이 `aws_caller_identity` 로 account_id 자동 추론
+ `aws_region` 변수와 조합. account_id + region prefix 가 박혀 전 AWS 통틀어 충돌 사실상
불가능 + audit 시 어느 계정/리전 버킷인지 즉시 식별 가능.

prod / staging 등 environment 구분은 namespace 에 직접 박을 것 (`claim-content-prod`,
`claim-content-staging`).

## 들어가는 것

| 컨텐츠 | Key prefix | 비고 |
|---|---|---|
| 파트너 프로필 사진 | `partners/avatar/{partnerId}/{nanoid}.{ext}` | 공개 GET — 가입자 결과/카드에 노출 |

새 컨텐츠 도메인 추가 시 `public_read_prefixes` 에 prefix 만 추가하면 됨.

## 들어가면 안 되는 것

- **설계서/제안서 PDF** — `S3_BUCKET_PROPOSALS` (100% private, 별도 인프라).
- **사용자 업로드 본인서류** (운전면허/신분증 등) — 별도 private 버킷 신설 권장.
- **시크릿/자격증명** — Secrets Manager / Vercel env.

## 보안 모델

- 버킷은 BlockPublicAccess 켜져 있고 ACL 차단.
- `public_read_prefixes` 의 prefix 만 bucket policy 로 `s3:GetObject` 공개 허용.
- 그 외 prefix 는 IAM 정책으로 앱만 접근 (presigned URL 발급 경유).
- presigned PUT 도 prefix 한정 IAM 정책으로 발급 불가 prefix 는 자동 차단.
- 객체 키에 `nanoid(16)` 박혀 enumeration 불가.

## CDN 전략

현재 layer 없음 — `<bucket>.s3.<region>.amazonaws.com` 직접 노출. 트래픽 / 글로벌 유저 / WAF 필요해지면 CloudFront 얹기:

1. CloudFront distribution + OAC 추가
2. bucket policy 의 공개 prefix 를 OAC ARN 한정으로 좁힘 (또는 그대로 둬도 무방)
3. `public_base_url` output 을 CloudFront 도메인으로 교체
4. 앱 env `CONTENT_PUBLIC_BASE_URL` 만 갱신

## 셋업

### 사전 준비

- AWS account + 자격증명 (`aws configure` 또는 `AWS_PROFILE`)
- `terraform >= 1.6`
- 기존 IAM user 재사용할 거면 user 이름 확인 (`aws iam list-users`)

### 진행

```bash
cd infra/content-bucket
cp terraform.tfvars.example terraform.tfvars
# tfvars 편집 — 최소 namespace 필수

terraform init
terraform plan
terraform apply
```

### 결과 확인

```bash
terraform output bucket_name              # → 123456789012-ap-northeast-2-claim-content-prod
terraform output public_base_url          # → https://<bucket>.s3.ap-northeast-2.amazonaws.com
terraform output -raw iam_secret_access_key   # 신규 user 만든 경우만
```

### Vercel env

```
S3_BUCKET_CONTENT=<bucket_name>
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=<기존 user 키 또는 위 output>
AWS_SECRET_ACCESS_KEY=<기존 user 키 또는 위 output>
```

기존 제안서 버킷 user 와 자격증명을 공유하려면 `iam_user_name` 변수에 user 이름
지정 — terraform 이 해당 user 에 정책만 추가 attach (key 신규 발급 X).

## State 위치

현재는 로컬 state. 운영 환경 늘어나면 S3 backend 로 옮기는 것을 권장
(`terraform.tfstate` 에 IAM secret 이 평문 박힘).

## 운영 절차

### 새 origin 추가 (커스텀 도메인 / staging 등)

1. tfvars 의 `cors_allowed_origins` 에 URL 추가
2. `terraform apply`

### 새 컨텐츠 prefix 추가

1. tfvars 의 `public_read_prefixes` 에 prefix 추가 (끝에 `/` 포함)
2. 앱 코드의 키 생성 컨벤션도 같은 prefix 사용하도록 동기
3. `terraform apply`

### 즉시 차단 (사고 대응)

```bash
# IAM 정책 detach → 앱이 PUT 실패. 공개 GET 은 그대로.
aws iam detach-user-policy --user-name <user> --policy-arn <output: arn>
```

bucket policy 까지 끄려면 `aws_s3_bucket_policy.content` 리소스를 terraform 에서
주석 처리 후 `terraform apply` (공개 GET 전부 차단).
