/** First ComfyUI output per asset. Art review/replacement is owned by the user. */
export const uiArt = (id: string) => `/assets/ui-v2/v1/${id}.png`;
export function operatorConcept(classId: string) {
  const id = classId === 'commando' ? 'assault' : classId === 'assassin' ? 'sniper' : classId;
  return uiArt(`operator-${id}`);
}
