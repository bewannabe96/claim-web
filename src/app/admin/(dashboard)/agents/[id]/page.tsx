import { notFound } from "next/navigation";

import { getAgentById } from "@/features/agents/queries";
import { cn } from "@/lib/utils";

import { AgentForm } from "../../_components/agent-form";
import {
  BackLink,
  Card,
  CardHeader,
  PageHeader,
} from "../../_components/page-shell";

export default async function AdminAgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgentById(id);
  if (!agent) notFound();

  const missRate = agent.recentSubmissions.length
    ? agent.recentSubmissions.filter((s) => !s).length /
      agent.recentSubmissions.length
    : 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <BackLink href="/admin/agents">설계사 풀</BackLink>
        <PageHeader
          title={agent.name}
          description={`${agent.id} · ${agent.email}`}
        />
      </div>

      {/* 운영 통계 */}
      <Card>
        <CardHeader title="운영 지표" />
        <dl className="grid grid-cols-3 gap-6">
          <Stat label="누적 노출" value={`${agent.exposureCount}회`} />
          <Stat
            label="최근 제출 이력"
            value={
              agent.recentSubmissions.length === 0
                ? "—"
                : `${agent.recentSubmissions.filter((s) => s).length}/${agent.recentSubmissions.length}`
            }
          />
          <Stat
            label="미제출률"
            value={
              agent.recentSubmissions.length === 0
                ? "—"
                : `${Math.round(missRate * 100)}%`
            }
            tone={missRate > 0.3 ? "alert" : "default"}
          />
        </dl>

        {agent.recentSubmissions.length > 0 && (
          <div className="mt-5">
            <p className="text-xs text-[#4b4b4b] mb-2">최근 제출 시퀀스</p>
            <div className="flex gap-1">
              {agent.recentSubmissions.map((s, i) => (
                <span
                  key={i}
                  className={cn(
                    "w-5 h-5 rounded-md text-[10px] flex items-center justify-center font-bold",
                    s ? "bg-black text-white" : "bg-[#efefef] text-[#afafaf]",
                  )}
                  title={s ? "제출" : "미제출"}
                >
                  {s ? "○" : "×"}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 편집 폼 */}
      <AgentForm
        agentId={agent.id}
        initial={{
          name: agent.name,
          avatarUrl: agent.avatarUrl,
          specialties: agent.specialties,
          bio: agent.bio,
          yearsOfExperience: agent.yearsOfExperience,
          trustMetric: agent.trustMetric,
          phone: agent.phone,
          email: agent.email,
          active: agent.active,
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "alert";
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-[#4b4b4b]">{label}</dt>
      <dd
        className={cn(
          "text-2xl font-bold tracking-tight",
          tone === "alert" ? "text-black" : "text-black",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
