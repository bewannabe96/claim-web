# template 1

code: UI_0735
name: [Claim] 파트너 선택 알림
body:
```
[Claim] #{partner_name} 파트너님,
#{customer_name}님이 파트너님을 선택해서 요청서를 보내셨어요:)

*희망보험료 : #{budget}
*필요 담보 : #{request_text}

고객님의 요청을 수락하시면 진설계에 필요한 정보를 전달드려요.
지금 바로 요청서를 확인하시고 설계제안서를 보내보세요!

(해당 메시지는 파트너님께서 '요청서 도착 알림'을 설정하신 경우 발송됩니다.)
```
link:
```
https://www.claim.ac/partner/plan-request-assignments/#{token}

```

# template 2

code: UI_0738
name: [Claim] 전화/문자 요청하기 알림
body:
```
[Claim] #{partner_name} 파트너님,
#{customer_name}님이 파트너님의 설계제안서를 보시고, 연락을 요청하셨어요:)

원활한 상담을 위하여 #{customer_name}님께서 요청하신 방법으로 지금 연락해보세요!

*전화번호 : #{customer_phone_no}
*연락 요청 방법 : #{contact_method}

(해당 메시지는 파트너님께서 '연락 요청 알림'을 설정하신 경우 발송됩니다.)
```

# template 3

code: UI_0741
name: [Claim] AI 제안서 분석 완료 알림	
body:
```
[Claim] #{customer_name}님께서 선택하신 파트너님들의 제안서를 Claim AI가 분석했어요 :)

지금 바로 분석 결과를 확인해보시고 마음에 드는 파트너님께 연락을 요청해보세요!
```
link:
```
https://www.claim.ac/plan-request/result/#{token}
```

# template 4

code: UI_0743
name: [Claim] AI분석 확인
body:
```
[Claim] #{customer_name}님이 요청하신 AI 분석이 '미확인' 상태로 확인됩니다.

*요청 정보
요청일자 : #{request_date}
서비스명 : 설계제안서 요청 및 AI 분석

서비스 종결을 위해 AI 분석 결과 확인이 필요합니다. 하단 버튼을 통해 절차를 진행해주세요.

본 메시지는 요청서 마감 알림 서비스를 신청한 회원에 한해 발송되는 1회성 메시지입니다.
```
link:
```
https://www.claim.ac/plan-request/result/#{token}
```
