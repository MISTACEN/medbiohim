"use client";

import { useCallback, useEffect, useState } from "react";
import { describeApiError } from "@/lib/errors";
import {
  staffCapabilities, staffCreateRequest, staffGroupManage, staffReviewJoinRequest,
  staffUpdateGroup, staffUpdateGroupMember, staffUpdateHomework,
} from "@/lib/api/staff";
import { moderateWorkshopItem } from "@/lib/api/workshop";

/**
 * Данные и действия кабинета старосты: загрузка capabilities и состояния
 * группы, параметры группы, подгруппы и «заморозка» курса, заявки,
 * модерация материалов мастерской и правка ДЗ.
 */
export function useGroupManage() {
  const [capabilities, setCapabilities] = useState<any>(null);
  const [groupId, setGroupId] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [groupForm, setGroupForm] = useState({ semester: "", stream: "" });
  const [subgroups, setSubgroups] = useState<Record<string, string>>({});
  const [courseBusy, setCourseBusy] = useState("");
  const [homeworkDrafts, setHomeworkDrafts] = useState<Record<string, { title: string; due: string }>>({});
  const [request, setRequest] = useState({ kind: "course_change", value: "", reason: "" });

  const load = useCallback(async (selected?: string) => {
    setLoading(true);
    setError("");
    const capabilitiesResult = await staffCapabilities();
    if (!capabilitiesResult.ok) { setError(describeApiError(capabilitiesResult.error)); setLoading(false); return; }
    setCapabilities(capabilitiesResult.data);
    const nextGroup = selected || groupId || capabilitiesResult.data.starosta_groups?.[0] || capabilitiesResult.data.groups?.[0]?.group_id || "";
    setGroupId(nextGroup);
    if (!nextGroup) { setLoading(false); return; }
    const manageResult = await staffGroupManage(nextGroup);
    if (!manageResult.ok) { setError(describeApiError(manageResult.error)); setLoading(false); return; }
    setData(manageResult.data);
    setGroupForm({ semester: String(manageResult.data.group?.semester ?? ""), stream: String(manageResult.data.group?.stream ?? "") });
    setSubgroups(Object.fromEntries((manageResult.data.members || []).map((member: any) => [member.user_id, member.subgroup || ""])));
    setHomeworkDrafts(Object.fromEntries((manageResult.data.homeworks || []).map((homework: any) => [homework.id, { title: homework.title || "", due: String(homework.due_at || homework.due_date || "").slice(0, 10) }])));
    setLoading(false);
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  async function saveGroup() {
    setBusy("group");
    const semester = Number(groupForm.semester);
    const result = await staffUpdateGroup(groupId, {
      semester: Number.isFinite(semester) && semester > 0 ? semester : undefined,
      stream: groupForm.stream || null,
    });
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote("Параметры группы сохранены.");
    await load(groupId);
  }

  async function saveSubgroup(userId: string) {
    setBusy(userId);
    const result = await staffUpdateGroupMember(groupId, userId, { subgroup: subgroups[userId] || null });
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote("Подгруппа обновлена.");
    await load(groupId);
  }

  async function toggleCourseFreeze(member: any) {
    const freeze = member.course_source !== "override";
    if (freeze && !member.course_number) { setError("Не из чего заморозить: курс не определён"); return; }
    setCourseBusy(member.user_id);
    const result = await staffUpdateGroupMember(groupId, member.user_id, {
      course_override: freeze ? Number(member.course_number) : null,
    });
    setCourseBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote(freeze ? "Курс заморожен: академотпуск/второгодничество." : "Курс снова считается автоматически.");
    await load(groupId);
  }

  async function saveHomework(id: string) {
    setBusy(id);
    const draft = homeworkDrafts[id];
    const result = await staffUpdateHomework(groupId, id, {
      title: draft.title,
      due_at: draft.due ? `${draft.due} 23:59:00` : null,
    });
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote("ДЗ обновлено.");
    await load(groupId);
  }

  async function curateWorkshop(id: string, hide: boolean) {
    setBusy(id);
    const result = await moderateWorkshopItem(id, { action: hide ? "hide" : "unhide" });
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote(hide ? "Материал группы скрыт." : "Материал группы снова виден.");
    await load(groupId);
  }

  async function reviewJoin(id: string, approve: boolean) {
    setBusy(id);
    const result = await staffReviewJoinRequest(groupId, id, approve);
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote(approve ? "Студент добавлен в группу." : "Заявка отклонена.");
    await load(groupId);
  }

  async function sendRequest() {
    const value = Number(request.value);
    if (!Number.isFinite(value) || value <= 0) { setError("Укажите новое значение"); return; }
    setBusy("request");
    const result = await staffCreateRequest({
      kind: request.kind as any,
      group_id: groupId,
      payload: request.kind === "course_change" ? { course_number: value } : { admission_year: value },
      reason: request.reason,
    });
    setBusy("");
    if (!result.ok) { setError(describeApiError(result.error)); return; }
    setNote("Запрос отправлен администратору.");
    setRequest({ kind: "course_change", value: "", reason: "" });
  }

  const starosta = Boolean(capabilities?.starosta_groups?.length) || capabilities?.can?.admin;

  return {
    capabilities, groupId, data, loading,
    busy, note, error,
    groupForm, setGroupForm, subgroups, setSubgroups,
    courseBusy, homeworkDrafts, setHomeworkDrafts, request, setRequest,
    starosta, load,
    saveGroup, saveSubgroup, toggleCourseFreeze, saveHomework,
    curateWorkshop, reviewJoin, sendRequest,
  };
}

export type GroupManageView = ReturnType<typeof useGroupManage>;
