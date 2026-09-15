/** Selected local ComfyUI candidates. Editable sources: art/ui-kit; npm run art:ui:studio. */
export const uiArt = (id: string) => `/assets/ui-kit/v1/${id === 'command-deck' ? 'command-room' : id}.png`;
export function operatorConcept(classId: string) {
  const id = classId === 'commando' ? 'assault' : classId === 'assassin' ? 'sniper' : classId;
  return uiArt(`operator-${id}`);
}
