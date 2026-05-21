# dev 환경 입력값. workspace=dev 와 함께 사용:
#   terraform workspace select dev
#   terraform apply -var-file=dev.tfvars
# workspace ↔ environment 불일치는 aws_s3_bucket precondition 이 차단.

environment = "dev"
namespace   = "claim-content-dev"

cors_allowed_origins = [
  "https://dev.claim.ac",
  "https://*.vercel.app",
  "http://localhost:*",
]
