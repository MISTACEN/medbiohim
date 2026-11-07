/**
 * Кабинет преподавателя (план §9–§10): сборка из доменных подмодулей.
 * Раньше это был монолит routes/teacher.ts на 1400+ строк — теперь
 * один домен = один файл (core, tests, assignments, test-assignments, students).
 */
import { Hono } from "hono";
import type { TeacherEnv } from "./_shared";
import core from "./core";
import tests from "./tests";
import assignments from "./assignments";
import testAssignments from "./assigned-tests";
import students from "./students";
import grading from "./grading";

const teacher = new Hono<TeacherEnv>();

teacher.route("/", core);
teacher.route("/", tests);
teacher.route("/", assignments);
teacher.route("/", testAssignments);
teacher.route("/", students);
teacher.route("/", grading);

export default teacher;
