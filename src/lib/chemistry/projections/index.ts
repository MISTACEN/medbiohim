import type { ProjectionInput, ProjectionKind, ProjectionResult } from "./types";
import { renderFischer } from "./fischer";
import { renderHaworth } from "./haworth";
import { renderNewman } from "./newman";
import { renderChair } from "./chair";

export type { ProjectionInput, ProjectionKind, ProjectionResult };

export function renderProjection(
  kind: ProjectionKind,
  input: ProjectionInput,
): ProjectionResult {
  switch (kind) {
    case "fischer":
      return renderFischer(input);
    case "haworth":
      return renderHaworth(input);
    case "newman":
      return renderNewman(input);
    case "chair":
      return renderChair(input);
    case "sawhorse":
      return {
        kind: "sawhorse",
        fidelity: "approximate",
        note: "Sawhorse — следующий шаг (косой вид вдоль C–C)",
        svg: renderNewman(input).svg.replace("Newman", "Sawhorse≈Newman"),
      };
    default:
      return renderFischer(input);
  }
}
