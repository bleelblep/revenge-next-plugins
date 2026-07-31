import { n as ReactNavigationParamList } from "./react-navigation-C0E6Cr3d.js";
import { ComponentProps, ComponentType, FC, ReactElement, ReactNode, RefAttributes, RefObject } from "react";
import { EventEmitter } from "node:events";
import { StackScreenProps } from "@react-navigation/stack";
import { ImageSourcePropType, ImageStyle, PressableProps, StyleProp, TextInputProps as TextInputProps$1, TextProps as TextProps$1, TextStyle, View, ViewProps, ViewStyle } from "react-native";
import { Buffer } from "buffer";
//#region lib/discord/src/types/api.d.ts
declare module '@revenge-mod/plugins/types' {
  interface InitPluginApi<O extends PluginApiExtensionsOptions> {
    logger: DiscordModules.Logger;
  }
}
//#endregion
//#region lib/discord/src/types/polyfills.d.ts
declare global {
  var Buffer: typeof Buffer;
}
//#endregion
//#region lib/discord/src/types/index.d.ts
declare namespace DiscordModules {
  namespace Flux {
    interface DispatcherPayload {
      type: string;
      [key: PropertyKey]: any;
    }
    type DispatcherDependency = any;
    interface StoreChangeCallbacks {
      add(cb: () => void): void;
      addConditional(cb: () => boolean): void;
      listeners: Set<() => void>;
      remove(cb: () => void): void;
      has(cb: () => void): boolean;
      hasAny(): boolean;
      invokeAll(): void;
    }
    type Store<T = object> = T & {
      addChangeListener(cb: () => void): void;
      removeChangeListener(cb: () => void): void;
      addReactChangeListener(cb: () => void): void;
      removeReactChangeListener(cb: () => void): void;
      addConditionalChangeListener(cb: () => boolean): void;
      callback(cb: () => void): void;
      throttledCallback(): unknown;
      getName(): string;
      __getLocalVars?(): object;
      _changeCallbacks: StoreChangeCallbacks;
      _isInitialized: boolean;
      _version: number;
      _reactChangeCallbacks: StoreChangeCallbacks;
      _dispatchToken: string;
    };
    interface Dispatcher {
      _actionHandlers: unknown;
      _interceptors?: ((payload: DispatcherPayload) => undefined | boolean)[];
      _currentDispatchActionType: undefined | string;
      _processingWaitQueue: boolean;
      _subscriptions: Record<string, Set<(payload: DispatcherPayload) => void>>;
      _waitQueue: unknown[];
      addDependencies(node1: DispatcherDependency, node2: DispatcherDependency): void;
      dispatch(payload: DispatcherPayload): Promise<void>;
      flushWaitQueue(): void;
      isDispatching(): boolean;
      register(name: string, actionHandler: Record<string, (e: DispatcherPayload) => void>, storeDidChange: (e: DispatcherPayload) => boolean): string;
      setInterceptor(interceptor?: (payload: DispatcherPayload) => undefined | boolean): void;
      /**
       * Subscribes to an action type
       * @param actionType The action type to subscribe to
       * @param callback The callback to call when the action is dispatched
       */
      subscribe(actionType: string, callback: (payload: DispatcherPayload) => void): void;
      /**
       * Unsubscribes from an action type
       * @param actionType The action type to unsubscribe from
       * @param callback The callback to remove
       */
      unsubscribe(actionType: string, callback: (payload: DispatcherPayload) => void): void;
      wait(cb: () => void): void;
    }
  }
  namespace AppStartPerformance {
    type MarkArgs = [emoji: string, log: string, delta?: number];
  }
  interface AppStartPerformance {
    mark(...args: AppStartPerformance.MarkArgs): void;
    markAndLog(logger: Logger, ...args: AppStartPerformance.MarkArgs): void;
    [index: string]: unknown;
  }
  interface Constants {
    [K: string]: string | number | boolean | null | ((...args: any[]) => any) | Constants;
  }
  /**
   * Discord's `Logger` class.
   *
   * Logs will be shown in the **Debug Logs** section in settings.
   */
  class Logger {
    constructor(tag: string);
    logDangerously(...args: unknown[]): void;
    log(...args: unknown[]): void;
    error(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    info(...args: unknown[]): void;
    time(...args: unknown[]): void;
    trace(...args: unknown[]): void;
    fileOnly(...args: unknown[]): void;
    verboseDangerously(...args: unknown[]): void;
    verbose(...args: unknown[]): void;
  }
  namespace Actions {
    interface AlertActionCreators {
      openAlert(key: string, alert: ReactElement): void;
      dismissAlert(key: string): void;
      dismissAlerts(): void;
      useAlertStore(): unknown;
    }
    interface ToastActionCreators {
      open(options: {
        key: string;
        content?: string;
        icon?: number | FC;
        IconComponent?: FC;
        /**
         * The icon's color, same string format as `<Text>`'s color prop
         */
        iconColor?: string;
        containerStyle?: ViewStyle;
      }): void;
      close(): void;
    }
    interface ActionSheetActionCreators {
      openLazy<T extends ComponentType<any>>(sheet: Promise<{
        default: T;
      }>, key: string, props: ComponentProps<T>): void;
      hideActionSheet(key?: string): void;
    }
  }
  namespace Components {
    namespace Styles {
      type TextType = 'heading' | 'text';
      type BasicTextSize = 'sm' | 'md' | 'lg';
      type BasicTextSizeWithExtraLarges = BasicTextSize | 'xl' | 'xxl';
      type TextSize = BasicTextSizeWithExtraLarges | 'xs' | 'xxs';
      type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold';
      type TextWeightWithExtraBold = TextWeight | 'extrabold';
      type RedesignTextCategory = 'message-preview' | 'channel-title';
      type TextVariant = `heading-${BasicTextSizeWithExtraLarges}/${TextWeightWithExtraBold}` | `text-${TextSize}/${TextWeight}` | `display-${BasicTextSize}` | `redesign/${RedesignTextCategory}/${TextWeight}` | 'redesign/heading-18/bold' | 'eyebrow';
      type TextStyleSheet = Record<TextVariant, TextProps$1>;
      type CreateStylesFunction = <const S extends Record<string, TextStyle | ViewStyle | ImageStyle>>(styles: S) => () => S;
    }
    type UseTooltipFunction = (ref: RefObject<View | null>, props: UseTooltipFunctionProps) => unknown;
    interface UseTooltipFunctionProps {
      label: string;
      position?: 'top' | 'bottom';
      visible?: boolean;
      onPress?: () => void;
    }
    interface BaseButtonProps extends PressableProps, RefAttributes<View> {
      disabled?: boolean;
      size?: ButtonSize;
      variant?: 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'active' | 'primary-overlay' | 'secondary-overlay';
      loading?: boolean;
      grow?: boolean;
      scaleAmountInPx?: number;
    }
    interface ButtonProps extends BaseButtonProps {
      icon?: number;
      loading?: boolean;
      iconPosition?: 'start' | 'end';
      renderIcon?(): ReactNode;
      renderRightIcon?(): ReactNode;
      renderShine?(): ReactNode;
      renderLinearGradient?(): ReactNode;
      cornerRadius?: number;
      textStyle?: TextStyle;
      loadingColorLight?: string;
      loadingColorDark?: string;
      text: string;
    }
    type ButtonSize = 'sm' | 'md' | 'lg';
    type Button = FC<ButtonProps>;
    interface IconButtonProps extends BaseButtonProps {
      icon: number;
      label?: string;
    }
    type IconButton = FC<IconButtonProps>;
    interface ImageButtonProps extends BaseButtonProps {
      image: ImageSourcePropType;
    }
    type ImageButton = FC<ImageButtonProps>;
    interface FloatingActionButtonProps {
      icon: number;
      onPress: () => void;
      positionBottom?: number;
      accessibilityLabel?: string;
    }
    type FloatingActionButton = FC<FloatingActionButtonProps>;
    interface StackProps extends ViewProps {
      spacing?: number;
      align?: ViewStyle['alignItems'];
      justify?: ViewStyle['justifyContent'];
      direction?: 'vertical' | 'horizontal';
    }
    type Stack = FC<StackProps>;
    interface CardProps extends ViewProps {
      start?: boolean;
      end?: boolean;
      variant?: 'primary' | 'secondary' | 'transparent';
      border?: 'faint' | 'normal' | 'strong' | 'subtle' | 'none';
      shadow?: 'none' | 'low' | 'medium' | 'high' | 'border' | 'ledge';
      children: ReactNode;
    }
    type Card = FC<CardProps>;
    interface TextFieldProps {
      onChange?: (value: string) => void;
      onBlur?: () => void;
      onFocus?: () => void;
      leadingIcon?: FC;
      trailingIcon?: FC;
      leadingText?: string;
      trailingText?: string;
      description?: string;
      errorMessage?: string;
      isDisabled?: boolean;
      focusable?: boolean;
      editable?: boolean;
      status?: TextFieldStatus;
      defaultValue?: string;
      value?: string;
      placeholder?: string;
      placeholderTextColor?: string;
      maxLength?: number;
      multiline?: boolean;
      autoFocus?: boolean;
      secureTextEntry?: boolean;
      returnKeyType?: TextInputProps$1['returnKeyType'];
      isClearable?: boolean;
      size?: TextFieldSize;
      style?: StyleProp<ViewStyle>;
    }
    type TextFieldSize = 'sm' | 'md' | 'lg';
    type TextFieldStatus = 'default' | 'error';
    interface TextInputProps extends TextFieldProps {
      isRound?: boolean;
      label?: string;
    }
    interface TextAreaProps extends Omit<TextInputProps, 'multiline'> {}
    type TextInput = FC<TextInputProps>;
    type TextField = FC<TextFieldProps>;
    type TextArea = FC<TextAreaProps>;
    interface FormSwitchProps extends ViewProps {
      value: boolean;
      onValueChange(value: boolean): void;
      disabled?: boolean;
    }
    type FormSwitch = FC<FormSwitchProps>;
    interface ActionSheetProps {
      children: ReactNode;
    }
    type ActionSheet = FC<ActionSheetProps>;
    interface ActionSheetCloseButtonProps extends Pick<ComponentProps<IconButton>, 'variant' | 'onPress'> {}
    type ActionSheetCloseButton = FC<ActionSheetCloseButtonProps>;
    type ActionSheetRow = TableRow;
    type ActionSheetRowIcon = TableRowIcon;
    type ActionSheetRowGroup = TableRowGroup;
    type ActionSheetSwitchRow = TableSwitchRow;
    interface BottomSheetTitleHeaderProps {
      leading?: ReactNode;
      title: string;
      trailing?: ReactNode;
    }
    type BottomSheetTitleHeader = FC<BottomSheetTitleHeaderProps>;
    type IconSize = 'extraSmall10' | 'extraSmall' | 'small' | 'small20' | 'medium' | 'large' | 'custom' | 'refreshSmall16' | 'small14';
    type TableRowVariant = 'default' | 'danger';
    interface TableCheckboxRowProps extends Omit<TableRowProps, 'trailing'> {
      checked: boolean;
      value: string;
    }
    type TableCheckboxRow = FC<TableCheckboxRowProps>;
    interface TableRadioGroupProps<T = string> extends TableRowGroupProps {
      children: ReactNode;
      onChange: (value: T) => void;
      defaultValue?: T;
    }
    interface TableRadioRowProps<T = any> extends TableRowProps {
      label: string;
      value: T;
    }
    function TableRadioGroup<T>(props: TableRadioGroupProps<T>): ReactElement;
    function TableRadioRow<T>(props: TableRadioRowProps<T>): ReactElement;
    interface TableRowProps {
      label: string;
      subLabel?: ReactNode;
      icon?: ReactNode;
      trailing?: ReactNode;
      arrow?: boolean;
      onPress?: PressableProps['onPress'];
      disabled?: boolean;
      draggable?: boolean;
      dragHandlePressableProps?: PressableProps;
      labelLineClamp?: number;
      subLabelLineClamp?: number;
      start?: boolean;
      end?: boolean;
      variant?: TableRowVariant;
    }
    interface TableRow extends FC<TableRowProps> {
      Arrow: FC;
      Icon: TableRowIcon;
      Group: TableRowGroup;
      TrailingText: TableRowTrailingText;
    }
    interface TableSwitchRowProps extends Omit<TableRowProps, 'trailing'> {
      accessibilityHint?: string;
      value: boolean;
      onValueChange(value: boolean): void;
    }
    type TableSwitchRow = FC<TableSwitchRowProps>;
    interface TableRowGroupProps {
      title?: string;
      description?: string;
      hasIcons?: boolean;
      accessibilityLabel?: string;
      accessibilityRole?: string;
      children: ReactNode;
    }
    type TableRowGroup = FC<TableRowGroupProps>;
    interface TableRowGroupTitleProps {
      title: string;
    }
    type TableRowGroupTitle = FC<TableRowGroupTitleProps>;
    type TableRowIconVariant = 'default' | 'blurple' | 'boosting-pink' | 'status-online' | 'status-idle' | 'status-dnd' | 'status-offline' | 'xbox' | 'playstation' | 'danger' | 'secondary' | 'translucent';
    interface TableRowIconProps {
      source: ImageSourcePropType;
      variant?: TableRowIconVariant;
    }
    type TableRowIcon = FC<TableRowIconProps>;
    interface TableRowTrailingTextProps {
      text: string;
    }
    type TableRowTrailingText = FC<TableRowTrailingTextProps>;
    interface AlertModalProps {
      title?: ReactNode;
      content?: ReactNode;
      extraContent?: ReactNode;
      actions?: ReactNode;
    }
    type AlertModal = FC<AlertModalProps>;
    type AlertActionButton = Button;
    interface ContextMenuProps {
      title: ReactNode;
      triggerOnLongPress?: boolean;
      items: Array<ContextMenuItem | ContextMenuItem[]>;
      align?: 'left' | 'right' | 'above' | 'below';
      children: (props: Partial<BaseButtonProps>) => ReactNode;
    }
    type ContextMenu = FC<ContextMenuProps>;
    interface ContextMenuItem {
      label: string;
      IconComponent?: FC;
      variant?: 'default' | 'destructive';
      action(): void;
    }
    interface TextProps extends TextProps$1 {
      variant?: Styles.TextVariant;
      color?: string;
      style?: StyleProp<TextStyle>;
      lineClamp?: number;
      ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
      tabularNumbers?: boolean;
      children?: ReactNode;
    }
    type Text = FC<TextProps>;
    interface IntlLinkProps {
      target: string;
      children?: ReactNode;
    }
    type IntlLink = FC<IntlLinkProps>;
    interface SliderProps {
      step: number;
      value: number;
      minimumValue: number;
      maximumValue: number;
      onValueChange: (value: number) => void;
      onSlidingStart?: () => void;
      onSlidingComplete?: (value: number) => void;
      startIcon?: ReactNode;
      endIcon?: ReactNode;
    }
    type Slider = FC<SliderProps>;
    interface NavigatorHeaderProps {
      icon?: ReactNode;
      title: string;
      subtitle?: string;
    }
    type NavigatorHeader = FC<NavigatorHeaderProps>;
    interface LayerScopeProps {
      children?: ReactNode;
      zIndex?: number;
    }
    type LayerScope = FC<LayerScopeProps>;
  }
  namespace Modules {
    namespace Settings {
      export interface SettingListRenderer {
        SettingsList: SettingsList;
      }
      export interface SettingsListProps {
        containerStyle?: StyleProp<ViewStyle>;
        initialSetting?: string;
        node: {
          type: 'list';
          ListHeaderComponent?: ComponentType;
          ListFooterComponent?: ComponentType;
          sections: Array<{
            label?: string | ReactNode;
            settings: string[];
            subLabel?: string | ReactNode;
          }>;
        };
      }
      export type SettingsList = FC<SettingsListProps>;
      export interface SettingsSection {
        label: string;
        settings: string[];
        index?: number;
      }
      interface BaseSettingsItem {
        useTitle: () => string;
        parent: string | null;
        unsearchable?: boolean;
        variant?: Components.TableRowProps['variant'];
        IconComponent?: () => ReactNode;
        usePredicate?: () => boolean;
        useTrailing?: () => ReactNode;
        useDescription?: () => string;
        useIsDisabled?: () => boolean;
      }
      export interface PressableSettingsItem extends BaseSettingsItem {
        type: 'pressable';
        withArrow?: boolean;
        onPress?: () => void;
      }
      export interface ToggleSettingsItem extends BaseSettingsItem {
        type: 'toggle';
        useValue: () => boolean;
        onValueChange?: (value: boolean) => void;
      }
      export interface RouteSettingsItem extends BaseSettingsItem {
        type: 'route';
        screen: {
          route: string;
          getComponent(): ComponentType<StackScreenProps<ReactNavigationParamList>>;
        };
      }
      export interface StaticSettingsItem extends BaseSettingsItem {
        type: 'static';
      }
      export type SettingsItem = PressableSettingsItem | ToggleSettingsItem | RouteSettingsItem | StaticSettingsItem;
      export {};
    }
  }
  namespace Utils {
    namespace TypedEventEmitter {
      type DefaultEventMap = [never];
      type EventMap<T> = Record<keyof T, any[]> | DefaultEventMap;
    }
    class TypedEventEmitter<T extends Record<string, any[]> = Record<string, any[]>> extends EventEmitter<T> {}
  }
}
//#endregion
export { DiscordModules as t };