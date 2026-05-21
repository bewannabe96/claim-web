# infra/content-bucket

서비스 컨텐츠 (이미지/사진 등) 전용 S3 버킷. 설계서/제안서 같은 "문서" 버킷
(`S3_BUCKET_PROPOSALS`) 과는 분리된 별도 버킷.

**환경 분리 패턴**:

- **state 격리**: terraform workspace (`prod` / `dev`)
- **입력값 분리**: 환경별 tfvars (`prod.tfvars` / `dev.tfvars`)
- **사고 차단**: workspace ↔ tfvars 불일치는 `aws_s3_bucket` precondition 이 plan 단계에서 차단

> ⚠️ **IAM 은 이 stack 범위 밖.** user / policy / access key 생성은 외부에서 별도
> 관리. 정책 작성에 필요한 ARN 은 outputs 로 노출.

## 파일

```
infra/content-bucket/
├── main.tf                  # 환경 무관 리소스 정의
├── variables.tf             # 입력 변수 (environment / namespace / cors_allowed_origins 등)
├── outputs.tf
├── versions.tf
├── prod.tfvars              # ← commit (환경 설정)
├── dev.tfvars               # ← commit (환경 설정)
├── .gitignore
└── README.md
```

state 는 `terraform.tfstate.d/<workspace>/terraform.tfstate` 에 workspace 별로
자동 격리 (local backend 기준).

## workspace ↔ tfvars 안전장치

`prod.tfvars` / `dev.tfvars` 가 각각 `environment = "prod"` / `"dev"` 를 박음.
`aws_s3_bucket.content` 의 precondition 이 `var.environment == terraform.workspace`
검증 → 어긋난 조합으로 apply 하면 명시적 에러:

```
var.environment ('prod') 와 terraform.workspace ('dev') 불일치 — 잘못된
tfvars + workspace 조합. `terraform workspace select prod` 또는 다른 tfvars 사용.
```

`default` workspace 도 `var.environment` validation (`prod` | `dev` 만 허용) 으로 차단.

## prod vs dev 입력값 차이

`prod.tfvars` vs `dev.tfvars`:

| 항목 | prod | dev |
|---|---|---|
| environment | `"prod"` | `"dev"` |
| namespace | `claim-content-prod` | `claim-content-dev` |
| 최종 버킷명 | `<acct>-<region>-claim-content-prod` | `<acct>-<region>-claim-content-dev` |
| cors_allowed_origins | `https://www.claim.ac` 만 | `https://dev.claim.ac` + `https://*.vercel.app` + `http://localhost:*` |
| public_read_prefixes | (variables.tf default — prod/dev 공통) | (동일) |

> prod 는 운영 도메인 한 곳만 허용 — Vercel preview / 로컬 dev 머신은 prod 버킷에
> 못 붙음 (의도된 격리). dev 는 Vercel preview + 로컬 port 와일드카드 허용.

`public_read_prefixes` 는 앱 코드의 키 컨벤션이 환경 무관이라 default 로 두고
tfvars 에서는 override 안 함 (양쪽 sync 누락 사고 방지).

## 버킷 명명 — AWS 권장 namespace 패턴

```
<account_id>-<region>-<namespace>
예: 123456789012-ap-northeast-2-claim-content-prod
    123456789012-ap-northeast-2-claim-content-dev
```

terraform 이 `aws_caller_identity` 로 account_id 자동 추론 + provider region 과 조합.
전 AWS 통틀어 충돌 사실상 불가능 + audit 시 어느 계정/리전 버킷인지 즉시 식별.

## 들어가는 것

| 컨텐츠 | Key prefix | 비고 |
|---|---|---|
| 파트너 프로필 사진 | `partners/avatar/{partnerId}/{nanoid}.{ext}` | 공개 GET — 가입자 결과/카드에 노출 |

새 컨텐츠 도메인 추가 시 `variables.tf` 의 `public_read_prefixes` default 갱신
(prod / dev 공통) + **외부 IAM 정책 Resource 도 같이 갱신**.

## 들어가면 안 되는 것

- **설계서/제안서 PDF** — `S3_BUCKET_PROPOSALS` (100% private, 별도 인프라).
- **사용자 업로드 본인서류** (운전면허/신분증 등) — 별도 private 버킷 신설 권장.
- **시크릿/자격증명** — Secrets Manager / Vercel env.

## 보안 모델

- 버킷은 BlockPublicAccess 켜져 있고 ACL 차단.
- `public_read_prefixes` 의 prefix 만 bucket policy 로 `s3:GetObject` 공개 허용.
- 그 외 prefix 는 100% private — 외부에서 작성한 IAM user 의 정책 (Resource 한정)
  으로만 접근. presigned URL 발급 시에도 그 IAM key 사용.
- 객체 키에 `nanoid(16)` 박혀 enumeration 불가.

## 셋업

### 사전 준비

- AWS account + 자격증명 (`aws configure` 또는 `AWS_PROFILE`)
- `terraform >= 1.6`

### 최초 1회

```bash
cd infra/content-bucket
terraform init

# workspace 생성 (한 번만)
terraform workspace new prod
terraform workspace new dev
```

### prod apply

```bash
terraform workspace select prod
terraform plan  -var-file=prod.tfvars
terraform apply -var-file=prod.tfvars

terraform output bucket_name              # → ...-claim-content-prod
terraform output app_object_resource_arns # → IAM 정책 Resource 에 사용
```

### dev apply

```bash
terraform workspace select dev
terraform plan  -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars

terraform output bucket_name              # → ...-claim-content-dev
```

### 현재 workspace 확인

```bash
terraform workspace show     # 현재
terraform workspace list     # 전체 (* 표시가 현재)
```

> ⚠️ workspace ↔ tfvars 어긋남은 precondition 이 잡지만, **apply 전 항상
> `workspace show` 로 확인** + `-var-file` 까먹지 말 것.

### Vercel env (환경별로 따로 등록)

| env | prod scope | dev/preview scope |
|---|---|---|
| `S3_BUCKET_CONTENT` | `<prod bucket_name>` | `<dev bucket_name>` |
| `AWS_ACCESS_KEY_ID` | prod IAM user 키 | dev IAM user 키 |
| `AWS_SECRET_ACCESS_KEY` | prod IAM user 시크릿 | dev IAM user 시크릿 |
| `AWS_REGION` | `ap-northeast-2` | `ap-northeast-2` |

> IAM user 는 외부에서 만든 것. Vercel env scope (Production / Preview / Development)
> 별로 다른 값 박을 것 — preview/dev 배포가 prod 버킷에 쓰면 안 됨.

## 외부 IAM 작성 가이드

이 stack 은 버킷만 만들고 끝. 앱이 쓸 IAM user / policy / access key 는 외부에서
만들 것.

```bash
terraform output bucket_arn
# → arn:aws:s3:::123456789012-ap-northeast-2-claim-content-prod

terraform output app_object_resource_arns
# → [
#     "arn:aws:s3:::.../partners/avatar/*",
#   ]
```

**권장 IAM 정책 형태**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ContentObjectReadWrite",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:HeadObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::123456789012-ap-northeast-2-claim-content-prod/partners/avatar/*"
      ]
    }
  ]
}
```

**prod / dev 자격증명 분리 필수** — dev 키로 prod 버킷에 절대 못 쓰도록 정책 Resource
를 해당 환경 버킷 ARN 으로 한정.

## CDN 전략

현재 layer 없음 — `<bucket>.s3.<region>.amazonaws.com` 직접 노출. 트래픽 / 글로벌 유저 / WAF 필요해지면 CloudFront 얹기:

1. CloudFront distribution + OAC 추가 (환경별)
2. bucket policy 의 공개 prefix 를 OAC ARN 한정으로 좁힘
3. `public_base_url` output 을 CloudFront 도메인으로 교체
4. 앱 env `CONTENT_PUBLIC_BASE_URL` 만 갱신

## State 위치

`terraform.tfstate.d/<workspace>/terraform.tfstate` (로컬 backend 기준). 운영
환경이 더 늘거나 협업이 필요해지면 S3 backend 로 옮기는 것을 권장.

S3 backend 전환 시:

```hcl
# backend.tf (새 파일)
terraform {
  backend "s3" {
    bucket  = "<state 전용 별도 버킷>"
    key     = "content-bucket/terraform.tfstate"
    region  = "ap-northeast-2"
    encrypt = true
  }
}
```

S3 backend 는 workspace 별로 `env:/<workspace>/<key>` prefix 를 자동 부여 — 추가
설정 불필요.

## 운영 절차

### 새 origin 추가 (커스텀 도메인 등)

해당 환경 tfvars 의 `cors_allowed_origins` 갱신 → workspace 선택 → `apply`.

### 새 컨텐츠 prefix 추가

1. `variables.tf` 의 `public_read_prefixes` default 갱신 (prod / dev 공통)
2. 양쪽 workspace 에서 `terraform apply -var-file=<env>.tfvars`
3. **외부 IAM 정책 Resource 도 같이 갱신**
4. 앱 코드의 키 생성 컨벤션도 같은 prefix 사용하도록 동기

### 즉시 차단 (사고 대응)

```bash
# 외부에서 만든 해당 환경 IAM 정책 detach → 앱이 PUT 실패. 공개 GET 은 그대로.
aws iam detach-user-policy --user-name <user> --policy-arn <policy arn>
```

bucket policy 까지 끄려면 `aws_s3_bucket_policy.content` 리소스를 주석 처리 후
**해당 workspace 만** select 한 상태에서 `terraform apply -var-file=<env>.tfvars`.

> ⚠️ workspace 전환 실수 방지 — `terraform workspace show` 매번 확인. precondition
> 이 tfvars 불일치는 잡아주지만, 의도와 같은 환경에 들어와 있는지는 사용자 책임.

## 새 환경 추가

1. `variables.tf` 의 `var.environment` validation 에 새 환경 키 추가
2. `<env>.tfvars` 새로 만들기 (`environment = "<env>"` + namespace + cors)
3. `terraform workspace new <env>`
4. `terraform apply -var-file=<env>.tfvars`
