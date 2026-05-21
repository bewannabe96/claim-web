provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  tags = merge(var.tags, { Environment = var.environment })

  # AWS 권장 namespace 패턴 — `<account_id>-<region>-<namespace>`.
  # 전 AWS 통틀어 충돌 사실상 불가능 + audit 시 어느 계정/리전인지 즉시 식별.
  bucket_name = "${data.aws_caller_identity.current.account_id}-${data.aws_region.current.name}-${var.namespace}"

  # 공개 GET prefix 마다 한 statement — wildcard 형태로 Resource 패턴 생성.
  public_read_resources = [
    for p in var.public_read_prefixes :
    "arn:aws:s3:::${local.bucket_name}/${p}*"
  ]
}

# ============================================================
# Bucket — 서비스 컨텐츠 (이미지/사진 등). 문서 (설계서/제안서) 버킷과 분리.
# ============================================================
resource "aws_s3_bucket" "content" {
  bucket = local.bucket_name
  tags   = local.tags

  lifecycle {
    # var.environment (tfvars 가 박는 값) 와 terraform.workspace 가 어긋나면 차단.
    # workspace=prod 에서 dev.tfvars 로 apply 같은 사고 방지. default workspace 도
    # var.environment validation 이 prod/dev 만 허용하므로 여기서 잡힘.
    precondition {
      condition     = var.environment == terraform.workspace
      error_message = "var.environment ('${var.environment}') 와 terraform.workspace ('${terraform.workspace}') 불일치 — 잘못된 tfvars + workspace 조합. `terraform workspace select ${var.environment}` 또는 다른 tfvars 사용."
    }

    # S3 한도 (63자) 사전 검증.
    precondition {
      condition     = length(local.bucket_name) <= 63
      error_message = "버킷명 ${local.bucket_name} 이 S3 한도 63자를 초과합니다 (${length(local.bucket_name)}자)."
    }
  }
}

# 객체 소유권을 버킷 owner 로 강제 — ACL 미사용 (모던 best practice).
resource "aws_s3_bucket_ownership_controls" "content" {
  bucket = aws_s3_bucket.content.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# 서버측 암호화 (SSE-S3). KMS 관리 비용 안 듦.
resource "aws_s3_bucket_server_side_encryption_configuration" "content" {
  bucket = aws_s3_bucket.content.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Public access 차단 — 단, bucket policy 는 허용 (특정 prefix 만 공개).
# RestrictPublicBuckets 만 false 로 둬서 policy 의 prefix 공개를 허용하고,
# ACL 기반 공개는 모두 막음.
resource "aws_s3_bucket_public_access_block" "content" {
  bucket = aws_s3_bucket.content.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

# Prefix 화이트리스트 — public_read_prefixes 만 공개 GET 허용.
data "aws_iam_policy_document" "bucket_policy" {
  count = length(var.public_read_prefixes) > 0 ? 1 : 0

  statement {
    sid     = "PublicReadForListedPrefixes"
    effect  = "Allow"
    actions = ["s3:GetObject"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    resources = local.public_read_resources
  }
}

resource "aws_s3_bucket_policy" "content" {
  count  = length(var.public_read_prefixes) > 0 ? 1 : 0
  bucket = aws_s3_bucket.content.id
  policy = data.aws_iam_policy_document.bucket_policy[0].json

  # policy 가 public access block 보다 먼저 적용되면 PutBucketPolicy 가 거부됨.
  depends_on = [aws_s3_bucket_public_access_block.content]
}

# CORS — 브라우저 presigned PUT + 공개 GET 둘 다.
# expose Content-Length / ETag 로 클라가 업로드 검증 가능.
resource "aws_s3_bucket_cors_configuration" "content" {
  bucket = aws_s3_bucket.content.id

  cors_rule {
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag", "Content-Length"]
    max_age_seconds = 600
  }
}

# 미완료 multipart upload 자동 정리 — 디스크 누수 방지.
resource "aws_s3_bucket_lifecycle_configuration" "content" {
  count  = var.abort_incomplete_multipart_days > 0 ? 1 : 0
  bucket = aws_s3_bucket.content.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = var.abort_incomplete_multipart_days
    }
  }
}

# ============================================================
# IAM (user / policy / access key) 는 이 stack 범위 밖.
# 외부에서 별도 관리. 정책 작성에 필요한 ARN 은 outputs 로 노출:
#   - bucket_arn
#   - app_object_resource_arns
# 권장 정책 형태:
#   {
#     "Effect": "Allow",
#     "Action": ["s3:PutObject", "s3:GetObject", "s3:HeadObject", "s3:DeleteObject"],
#     "Resource": ["<bucket_arn>/partners/avatar/*", ...]
#   }
# ============================================================
