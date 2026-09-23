export type GlobalRole = "student" | "teacher" | "moderator" | "admin";
export type GroupRole = "student" | "starosta";

export interface User {
  id: string;
  name: string;
  email: string;
  role: GlobalRole;
  avatarUrl?: string;
  course?: number;
  semester?: number;
  groupId?: string;
  groupName?: string;
}

export interface ScheduleEntry {
  id: string;
  subject: string;
  type: string;
  startTime: string;
  endTime: string;
  room: string;
  teacher?: string;
  isNonStandard?: boolean;
  topic?: string;
  dayIndex?: number;
  slotIndex?: number;
}

export interface HomeworkItem {
  id: string;
  title: string;
  subject: string;
  dueAt: string;
  status: "pending" | "submitted" | "graded" | "overdue";
  description?: string;
  grade?: number;
  feedback?: string;
  attachments?: Array<{file_id:string;name?:string|null;mime_type?:string|null;size_bytes?:number|null;attachment_type?:string;caption?:string|null;inline_view?:boolean;download_url?:string|null}>;

}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  type: "news" | "change" | "system";
}

export interface Subject {
  id: string;
  name: string;
  course: number;
  semester: number;
  controlType: "exam" | "credit";
  lectureHours?: number;
  practiceHours?: number;
}

export interface Material {
  id: string;
  title: string;
  subject: string;
  type: string;
  size?: string;
  date: string;
  fileId: string;
}

export interface TestItem {
  id: string;
  title: string;
  subject: string;
  type: "test" | "ticket";
  questionCount: number;
  course: number;
  status?: string;
}

export interface ProgressSubject {
  subject: string;
  testsDone: number;
  testsTotal: number;
  avgScore: number;
  homeworkDone: number;
  homeworkTotal: number;
}

export interface CommunityPost {
  id: string;
  author: string;
  role: string;
  title: string;
  body: string;
  createdAt: string;
  likes: number;
  comments: number;
}

export interface TicketQuestion {
  number: number;
  kind: string;
  text: string;
}
