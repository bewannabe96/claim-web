variable "aws_region" {
  description = "AWS region. 한국 사용자 기준 ap-northeast-2 권장."
  type        = string
  default     = "ap-northeast-2"
}

variable "namespace" {
  description = <<-EOT
    버킷 namespace (용도 식별자). 최종 버킷명은 AWS 권장 패턴
    `<account_id>-<region>-<namespace>` 로 자동 조합 — 예 namespace=`claim-content-prod`
    → `123456789012-ap-northeast-2-claim-content-prod`.

    account_id + region 이 앞에 박혀 전 AWS 통틀어 충돌 사실상 불가능 + audit 시 어느
    계정/리전 버킷인지 즉시 식별.
  EOT
  type        = string

  validation {
    # 길이 2~35자 — 가장 긴 region (`ap-northeast-2` 14자) 기준 conservative 캡:
    # account_id(12) + "-" + region(14) + "-" + namespace(35) = 63 (S3 한도).
    # 짧은 region (예: `us-east-1` 9자) 은 namespace 40 자까지 들어가지만 region-agnostic
    # 호환을 위해 35 로 통일. 정확한 한도 체크는 main.tf 의 aws_s3_bucket precondition 이 담당.
    condition     = can(regex("^[a-z0-9][a-z0-9-]{0,33}[a-z0-9]$", var.namespace))
    error_message = "namespace 는 소문자/숫자/하이픈만, 시작·끝은 영숫자, 길이 2~35자."
  }
}

variable "environment" {
  description = "환경 식별자. 태그에만 사용 — 버킷명 environment 구분은 namespace 에 박을 것 (예: claim-content-prod)."
  type        = string
  default     = "prod"
}

variable "public_read_prefixes" {
  description = <<-EOT
    공개 GET 허용 prefix 목록. 이 prefix 하위 객체는 인증 없이 누구나 GET 가능 (공개 CDN
    대용). 다른 prefix 는 100% private — bucket policy 가 prefix 화이트리스트 방식.

    초기값: 파트너 프로필 사진. 새 컨텐츠 도메인 추가 시 여기에 prefix 만 추가하면 됨.
  EOT
  type        = list(string)
  default     = ["partners/avatar/"]
}

variable "cors_allowed_origins" {
  description = <<-EOT
    presigned PUT / 공개 GET 모두 허용할 브라우저 origin 목록. prod / staging /
    Vercel preview / 로컬 dev 까지 묶어서 지정.
  EOT
  type        = list(string)
  default = [
    "http://localhost:3000",
    "https://*.vercel.app",
  ]
}

variable "iam_user_name" {
  description = <<-EOT
    이 버킷에 대한 PUT/GET/HEAD/DELETE 권한을 attach 할 기존 IAM user 이름.
    빈 문자열이면 새 dedicated IAM user 를 만들고 access key 를 outputs 로 노출
    (sensitive). 기존 user (예: 제안서 버킷용) 와 자격증명을 공유하려면 그 user 이름 지정.
  EOT
  type        = string
  default     = ""
}

variable "abort_incomplete_multipart_days" {
  description = "미완료 multipart upload 자동 청소까지 (일). 0 이면 비활성."
  type        = number
  default     = 1
}

variable "tags" {
  description = "모든 리소스에 적용할 태그"
  type        = map(string)
  default = {
    Project   = "claim-web"
    Component = "content-bucket"
    ManagedBy = "terraform"
  }
}
