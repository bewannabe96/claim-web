variable "environment" {
  description = <<-EOT
    환경 식별자. `terraform.workspace` 와 반드시 일치해야 함 — 일치 검증은 main.tf 의
    `aws_s3_bucket` precondition 이 담당. 환경별 tfvars (prod.tfvars / dev.tfvars) 가
    이 값을 박음 → workspace 와 tfvars 가 어긋난 조합으로 apply 하는 사고 차단.
  EOT
  type        = string

  validation {
    condition     = contains(["prod", "dev"], var.environment)
    error_message = "environment 는 prod 또는 dev. 새 환경 추가 시 이 validation 확장."
  }
}

variable "namespace" {
  description = <<-EOT
    버킷 namespace (용도 식별자). 최종 버킷명은 AWS 권장 패턴
    `<account_id>-<region>-<namespace>` 로 자동 조합 — 예 namespace=`claim-content-prod`
    → `123456789012-ap-northeast-2-claim-content-prod`.

    환경별 tfvars 에서 박을 것 (prod=claim-content-prod, dev=claim-content-dev).
  EOT
  type        = string

  validation {
    # 길이 2~35자 — account_id(12) + "-" + region(14, ap-northeast-2) + "-" + namespace(35) = 63 (S3 한도).
    condition     = can(regex("^[a-z0-9][a-z0-9-]{0,33}[a-z0-9]$", var.namespace))
    error_message = "namespace 는 소문자/숫자/하이픈만, 시작·끝은 영숫자, 길이 2~35자."
  }
}

variable "cors_allowed_origins" {
  description = <<-EOT
    presigned PUT / 공개 GET 모두 허용할 브라우저 origin 목록. 환경별 tfvars 에서 박을 것.
    S3 CORS 는 origin 당 와일드카드 1개 허용 — `http://localhost:*` 같이 port 자리 와일드카드도
    동작 (dev 한정 권장).
  EOT
  type        = list(string)
}

variable "aws_region" {
  description = "AWS region. 한국 사용자 기준 ap-northeast-2 권장."
  type        = string
  default     = "ap-northeast-2"
}

variable "public_read_prefixes" {
  description = <<-EOT
    공개 GET 허용 prefix 목록. 이 prefix 하위 객체는 인증 없이 누구나 GET 가능 (공개 CDN
    대용). 다른 prefix 는 100% private — bucket policy 가 prefix 화이트리스트 방식.

    prod / dev 공통 — 앱 코드의 키 생성 컨벤션도 공유. 그래서 default 로 두고 env tfvars
    에서는 override 안 함 (양쪽 sync 누락 사고 방지).
  EOT
  type        = list(string)
  default     = ["partners/avatar/"]
}

variable "abort_incomplete_multipart_days" {
  description = "미완료 multipart upload 자동 청소까지 (일). 0 이면 비활성."
  type        = number
  default     = 1
}

variable "tags" {
  description = "모든 리소스에 적용할 태그 (Environment 태그는 var.environment 로 자동 주입)."
  type        = map(string)
  default = {
    Project   = "claim-web"
    Component = "content-bucket"
    ManagedBy = "terraform"
  }
}
