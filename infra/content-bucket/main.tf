provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  tags = merge(var.tags, { Environment = var.environment })

  # AWS 권장 namespace 패턴 — `<account_id>-<region>-<namespace>`.
  # 전 AWS 통틀어 충돌 사실상 불가능 + audit 시 어느 계정/리전인지 즉시 식별.
  bucket_name = "${data.aws_caller_identity.current.account_id}-${var.aws_region}-${var.namespace}"

  # 공개 GET prefix 마다 한 statement — wildcard 형태로 Resource 패턴 생성.
  public_read_resources = [
    for p in var.public_read_prefixes :
    "arn:aws:s3:::${local.bucket_name}/${p}*"
  ]

  create_iam_user = var.iam_user_name == ""
  iam_user_name   = local.create_iam_user ? aws_iam_user.content[0].name : var.iam_user_name
}

# ============================================================
# Bucket — 서비스 컨텐츠 (이미지/사진 등). 문서 (설계서/제안서) 버킷과 분리.
# ============================================================
resource "aws_s3_bucket" "content" {
  bucket = local.bucket_name
  tags   = local.tags

  lifecycle {
    # S3 한도 (63자) 사전 검증 — 짧은 region 은 namespace 길이 여유 있고, 긴 region
    # (ap-northeast-2 등) 은 변수 검증 + 이 precondition 으로 이중 보호.
    # AWS API 의 cryptic 에러 대신 명확한 한도 안내.
    precondition {
      condition     = length(local.bucket_name) <= 63
      error_message = "버킷명 ${local.bucket_name} 이 S3 한도 63자를 초과합니다 (${length(local.bucket_name)}자). namespace 를 더 짧게 잡으세요."
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
# IAM — 앱이 사용할 user / policy. PUT/GET/HEAD/DELETE on public prefix 만 허용.
# ============================================================
data "aws_iam_policy_document" "app_policy" {
  statement {
    sid    = "ContentObjectReadWrite"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:HeadObject",
      "s3:DeleteObject",
    ]
    resources = local.public_read_resources
  }
}

resource "aws_iam_policy" "app" {
  # IAM 은 계정-내 unique 라 account_id/region prefix 불필요 — namespace 만 사용.
  # IAM name 한도 (policy 128 / user 64) 보호 차원에서도 유리.
  name        = "${var.namespace}-app"
  description = "App-side access to ${local.bucket_name} content prefixes"
  policy      = data.aws_iam_policy_document.app_policy.json
  tags        = local.tags
}

# iam_user_name 미지정 시 dedicated user 생성. 지정 시 기존 user 재사용 (data source).
resource "aws_iam_user" "content" {
  count = local.create_iam_user ? 1 : 0
  name  = "${var.namespace}-app"
  tags  = local.tags
}

resource "aws_iam_user_policy_attachment" "app" {
  user       = local.iam_user_name
  policy_arn = aws_iam_policy.app.arn
}

# 새 user 만든 경우만 access key 생성. 기존 user 면 이미 key 가 있다고 가정 (수동 회전).
resource "aws_iam_access_key" "content" {
  count = local.create_iam_user ? 1 : 0
  user  = aws_iam_user.content[0].name
}
