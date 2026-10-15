import { emptyPresentation } from "./presentation.js";
import { emptyProjectModel, type ProjectProfile } from "./project-model.js";
export function newProjectTemplate(profile: ProjectProfile) {
  const presentation=emptyPresentation();
  presentation.model=emptyProjectModel(profile);
  presentation.nameDisplay="display";
  presentation.panels.editor=340;
  presentation.panels.inspectorCollapsed=true;
  presentation.views.all!.defaultDetail="all";
  return {sourceText:"// Nouveau projet\n",presentation};
}
