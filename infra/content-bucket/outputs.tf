output "bucket_name" {
  description = <<-EOT
    실제 적용된 버킷명 (`<account_id>-<region>-<namespace>` 패턴).
    Vercel env `S3_BUCKET_CONTENT` 에 박을 값.
  EOT
  value       = aws_s3_bucket.content.bucket
}

output "bucket_arn" {
  description = "버킷 ARN (cross-account share / 추가 정책 attach 용)"
  value       = aws_s3_bucket.content.arn
}

output "public_base_url" {
  description = <<-EOT
    공개 GET prefix 의 base URL. virtual-hosted style.
    예: 키 `partners/avatar/abc/xyz.jpg` 는 `<public_base_url>/partners/avatar/abc/xyz.jpg`.
    CloudFront 얹는 시점에 이 값을 도메인으로 교체.
  EOT
  value       = "https://${aws_s3_bucket.content.bucket}.s3.${var.aws_region}.amazonaws.com"
}

output "iam_user_name" {
  description = "정책이 attach 된 IAM user. 신규 생성됐으면 새 이름, 기존 user 재사용했으면 var 그대로."
  value       = local.iam_user_name
}

output "iam_access_key_id" {
  description = "신규 IAM user 의 access key id. 기존 user 재사용 시 빈 문자열."
  value       = local.create_iam_user ? aws_iam_access_key.content[0].id : ""
}

output "iam_secret_access_key" {
  description = <<-EOT
    신규 IAM user 의 secret. 기존 user 재사용 시 빈 문자열.
    `terraform output -raw iam_secret_access_key` 로 1회 추출 후 Vercel env 에 박을 것.
    state 에 평문 저장되므로 backend 암호화 필수.
  EOT
  value       = local.create_iam_user ? aws_iam_access_key.content[0].secret : ""
  sensitive   = true
}

output "next_steps" {
  description = "셋업 후 다음 단계 안내"
  value       = <<-EOT

    ✓ Bucket: ${aws_s3_bucket.content.bucket} (${var.aws_region})
    ✓ Public base URL: https://${aws_s3_bucket.content.bucket}.s3.${var.aws_region}.amazonaws.com
    ✓ Public read prefixes: ${join(", ", var.public_read_prefixes)}
    ✓ IAM user: ${local.iam_user_name}${local.create_iam_user ? " (신규 생성)" : " (기존 user 재사용)"}

    다음 단계:
      1) Vercel env 등록:
           S3_BUCKET_CONTENT=${aws_s3_bucket.content.bucket}
${local.create_iam_user ? "           AWS_ACCESS_KEY_ID=<terraform output -raw iam_access_key_id>\n           AWS_SECRET_ACCESS_KEY=<terraform output -raw iam_secret_access_key>\n         (기존 제안서 버킷 user 와 분리됐다면 별도 키 필요 — 통합하려면 iam_user_name 변수에 기존 user 명 지정 후 destroy/apply)" : "           AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY 는 기존 user (${local.iam_user_name}) 의 키 그대로 사용"}
           AWS_REGION=${var.aws_region}
      2) Custom origin 추가 시 var.cors_allowed_origins 갱신 후 `terraform apply`.
      3) 새 컨텐츠 prefix 추가 시 var.public_read_prefixes 에 prefix 추가 (앱 코드 키 컨벤션도 동기).
  EOT
}
