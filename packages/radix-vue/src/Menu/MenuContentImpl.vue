<script lang="ts">
import type { Ref } from 'vue'
import type {
  GraceIntent,
  Side,
} from './utils'
import type { FocusScopeProps } from '@/FocusScope'
import type { RovingFocusGroupEmits } from '@/RovingFocus'
import type {
  DismissableLayerEmits,
  DismissableLayerProps,
} from '@/DismissableLayer'
import type { PopperContentProps } from '@/Popper'

import {
  createContext,
  getActiveElement,
  useArrowNavigation,
  useBodyScrollLock,
  useCollection,
  useFocusGuards,
  useForwardExpose,
  useTypeahead,
} from '@/shared'

export interface MenuContentContext {
  onItemEnter: (event: PointerEvent) => boolean
  onItemLeave: (event: PointerEvent) => void
  onTriggerLeave: (event: PointerEvent) => boolean
  searchRef: Ref<string>
  pointerGraceTimerRef: Ref<number>
  onPointerGraceIntentChange: (intent: GraceIntent | null) => void
}

export const [injectMenuContentContext, provideMenuContentContext]
  = createContext<MenuContentContext>('MenuContent')

export interface MenuContentImplPrivateProps {
  /**
   * When `true`, hover/focus/click interactions will be disabled on elements outside
   * the `DismissableLayer`. Users will need to click twice on outside elements to
   * interact with them: once to close the `DismissableLayer`, and again to trigger the element.
   */
  disableOutsidePointerEvents?: DismissableLayerProps['disableOutsidePointerEvents']
  /**
   * Whether scrolling outside the `MenuContent` should be prevented
   * @defaultValue false
   */
  disableOutsideScroll?: boolean

  /**
   * Whether focus should be trapped within the `MenuContent`
   * @defaultValue also
   */
  trapFocus?: FocusScopeProps['trapped']
}

export type MenuContentImplEmits = DismissableLayerEmits & Omit<RovingFocusGroupEmits, 'update:currentTabStopId'> & {
  openAutoFocus: [event: Event]
  /**
   * Event handler called when auto-focusing on close.
   * Can be prevented.
   */
  closeAutoFocus: [event: Event]
}

type MenuContentImplPrivateEmits = MenuContentImplEmits & {
  /**
   * Handler called when the `DismissableLayer` should be dismissed
   */
  dismiss: []
}

export interface MenuContentImplProps
  extends MenuContentImplPrivateProps,
  Omit<PopperContentProps, 'dir'> {
  /**
   * When `true`, keyboard navigation will loop from last item to first, and vice versa.
   * @defaultValue false
   */
  loop?: boolean
}

export interface MenuRootContentTypeProps
  extends Omit<MenuContentImplProps, 'disableOutsidePointerEvents' | 'disableOutsideScroll' | 'trapFocus'> {}
</script>

<script setup lang="ts">
import {
  onUnmounted,
  ref,
  toRefs,
  watch,
} from 'vue'
import { injectMenuContext, injectMenuRootContext } from './MenuRoot.vue'
import {
  FIRST_LAST_KEYS,
  LAST_KEYS,
  focusFirst,
  getOpenState,
  isMouseEvent,
  isPointerInGraceArea,
} from './utils'
import { FocusScope } from '@/FocusScope'
import { DismissableLayer } from '@/DismissableLayer'
import {
  PopperContent,
  PopperContentPropsDefaultValue,
} from '@/Popper'
import { RovingFocusGroup } from '@/RovingFocus'

const props = withDefaults(defineProps<MenuContentImplProps>(), {
  ...PopperContentPropsDefaultValue,
})
const emits = defineEmits<MenuContentImplPrivateEmits>()
const menuContext = injectMenuContext()
const rootContext = injectMenuRootContext()

const { trapFocus, disableOutsidePointerEvents, loop } = toRefs(props)

useFocusGuards()
useBodyScrollLock(disableOutsidePointerEvents.value)

const searchRef = ref('')
const timerRef = ref(0)
const pointerGraceTimerRef = ref(0)
const pointerGraceIntentRef = ref<GraceIntent | null>(null)
const pointerDirRef = ref<Side>('right')
const lastPointerXRef = ref(0)
const currentItemId = ref<string | null>(null)

const { createCollection } = useCollection()
const { forwardRef, currentElement: contentElement } = useForwardExpose()
const collectionItems = createCollection(contentElement)

watch(contentElement, (el) => {
  menuContext!.onContentChange(el)
})

const { handleTypeaheadSearch } = useTypeahead(collectionItems)

onUnmounted(() => {
  window.clearTimeout(timerRef.value)
})

function isPointerMovingToSubmenu(event: PointerEvent) {
  const isMovingTowards
    = pointerDirRef.value === pointerGraceIntentRef.value?.side

  return (
    isMovingTowards
    && isPointerInGraceArea(event, pointerGraceIntentRef.value?.area)
  )
}

async function handleMountAutoFocus(event: Event) {
  emits('openAutoFocus', event)
  if (event.defaultPrevented)
    return
  // when opening, explicitly focus the content area only and leave
  // `onEntryFocus` in  control of focusing first item
  event.preventDefault()
  contentElement.value?.focus({
    preventScroll: true,
  })
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented)
    return
  // submenu key events bubble through portals. We only care about keys in this menu.
  const target = event.target as HTMLElement
  const isKeyDownInside
    = target.closest('[data-radix-menu-content]') === event.currentTarget
  const isModifierKey = event.ctrlKey || event.altKey || event.metaKey
  const isCharacterKey = event.key.length === 1

  const el = useArrowNavigation(
    event,
    getActiveElement() as HTMLElement,
    contentElement.value,
    {
      loop: loop.value,
      arrowKeyOptions: 'vertical',
      dir: rootContext?.dir.value,
      focus: true,
      attributeName: '[data-radix-vue-collection-item]:not([data-disabled])',
    },
  )
  if (el)
    return el?.focus()

  // prevent "Space" taken account into handleTypeahead
  if (event.code === 'Space')
    return

  if (isKeyDownInside) {
    // menus should not be navigated using tab key so we prevent it
    if (event.key === 'Tab')
      event.preventDefault()
    if (!isModifierKey && isCharacterKey)
      handleTypeaheadSearch(event.key)
  }

  // focus first/last item based on key pressed
  if (event.target !== contentElement.value)
    return
  if (!FIRST_LAST_KEYS.includes(event.key))
    return
  event.preventDefault()
  const candidateNodes = collectionItems.value
  if (LAST_KEYS.includes(event.key))
    candidateNodes.reverse()
  focusFirst(candidateNodes)
}

function handleBlur(event: FocusEvent) {
  // clear search buffer when leaving the menu
  // @ts-expect-error the provided currentTarget and target should be HTMLElement
  if (!event?.currentTarget?.contains?.(event.target)) {
    window.clearTimeout(timerRef.value)
    searchRef.value = ''
  }
}

function handlePointerMove(event: PointerEvent) {
  if (!isMouseEvent(event))
    return
  const target = event.target as HTMLElement
  const pointerXHasChanged = lastPointerXRef.value !== event.clientX

  // We don't use `event.movementX` for this check because Safari will
  // always return `0` on a pointer event.
  if (
    (event?.currentTarget as HTMLElement)?.contains(target)
    && pointerXHasChanged
  ) {
    const newDir = event.clientX > lastPointerXRef.value ? 'right' : 'left'
    pointerDirRef.value = newDir
    lastPointerXRef.value = event.clientX
  }
}

provideMenuContentContext({
  onItemEnter: (event) => {
    // event.preventDefault() we can't prevent pointerMove event
    if (isPointerMovingToSubmenu(event))
      return true
    else
      return false
  },
  onItemLeave: (event) => {
    if (isPointerMovingToSubmenu(event))
      return
    contentElement.value?.focus()
    currentItemId.value = null
  },
  onTriggerLeave: (event) => {
    // event.preventDefault() we can't prevent pointerLeave event
    if (isPointerMovingToSubmenu(event))
      return true
    else
      return false
  },
  searchRef,
  pointerGraceTimerRef,
  onPointerGraceIntentChange: (intent) => {
    pointerGraceIntentRef.value = intent
  },
})
</script>

<template>
  <FocusScope
    as-child
    :trapped="trapFocus"
    @mount-auto-focus="handleMountAutoFocus"
    @unmount-auto-focus="emits('closeAutoFocus', $event)"
  >
    <DismissableLayer
      as-child
      :disable-outside-pointer-events="disableOutsidePointerEvents"
      @escape-key-down="emits('escapeKeyDown', $event)"
      @pointer-down-outside="emits('pointerDownOutside', $event)"
      @focus-outside="emits('focusOutside', $event)"
      @interact-outside="emits('interactOutside', $event)"
      @dismiss="emits('dismiss')"
    >
      <RovingFocusGroup
        v-model:current-tab-stop-id="currentItemId"
        as-child
        orientation="vertical"
        :dir="rootContext.dir.value"
        :loop="loop"
        @entry-focus="(event) => {
          emits('entryFocus', event)
          // only focus first item when using keyboard
          if (!rootContext.isUsingKeyboardRef.value) event.preventDefault();
        }"
      >
        <PopperContent
          :ref="forwardRef"
          role="menu"
          :as="as"
          :as-child="asChild"
          aria-orientation="vertical"
          data-radix-menu-content
          :data-state="getOpenState(menuContext.open.value)"
          :dir="rootContext.dir.value"
          :side="side"
          :side-offset="sideOffset"
          :align="align"
          :align-offset="alignOffset"
          :avoid-collisions="avoidCollisions"
          :collision-boundary="collisionBoundary"
          :collision-padding="collisionPadding"
          :arrow-padding="arrowPadding"
          :prioritize-position="prioritizePosition"
          :sticky="sticky"
          :hide-when-detached="hideWhenDetached"
          @keydown="handleKeyDown"
          @blur="handleBlur"
          @pointermove="handlePointerMove"
        >
          <slot />
        </PopperContent>
      </RovingFocusGroup>
    </DismissableLayer>
  </FocusScope>
</template>
