output "static_ip" {
  description = "고정 IP — 알리고 콘솔에 whitelist 등록할 값"
  value       = aws_lightsail_static_ip.proxy.ip_address
}

output "proxy_url" {
  description = "Vercel ALIGO_PROXY_URL 에 박을 base URL"
  value       = var.domain != "" ? "https://${var.domain}" : "https://${aws_lightsail_static_ip.proxy.ip_address}.nip.io"
}

output "shared_secret" {
  description = "Vercel ALIGO_PROXY_SECRET — `terraform output -raw shared_secret` 으로 추출"
  value       = random_password.shared_secret.result
  sensitive   = true
}

output "ssh_host" {
  description = "SSH 접속 IP"
  value       = aws_lightsail_static_ip.proxy.ip_address
}

output "next_steps" {
  description = "Vercel 쪽 셋업 안내"
  value       = <<-EOT

    ✓ 인스턴스 IP: ${aws_lightsail_static_ip.proxy.ip_address}
    ✓ 프록시 URL: ${var.domain != "" ? "https://${var.domain}" : "https://${aws_lightsail_static_ip.proxy.ip_address}.nip.io"}

    다음 단계:
      1) 알리고 콘솔 → API 사용 IP 등록에 ${aws_lightsail_static_ip.proxy.ip_address} 추가
      2) (커스텀 도메인 사용 시) DNS A 레코드: ${var.domain != "" ? var.domain : "(skip)"} → ${aws_lightsail_static_ip.proxy.ip_address}
      3) 부트스트랩 완료 대기 (~5분). 확인:
           ssh ubuntu@${aws_lightsail_static_ip.proxy.ip_address} 'systemctl status aligo-proxy caddy --no-pager'
      4) 헬스체크:
           curl https://${var.domain != "" ? var.domain : "${aws_lightsail_static_ip.proxy.ip_address}.nip.io"}/healthz
      5) Vercel env 추가:
           ALIGO_PROXY_URL=<terraform output -raw proxy_url>
           ALIGO_PROXY_SECRET=<terraform output -raw shared_secret>
      6) src/server/aligo.ts 의 fetch URL 을 $ALIGO_PROXY_URL/aligo/send/ 로 전환 + Authorization Bearer 헤더
  EOT
}
