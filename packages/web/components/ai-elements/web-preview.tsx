'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ArrowLeft, ArrowRight, RefreshCw, ExternalLink } from 'lucide-react';

interface WebPreviewContextValue {
  url: string;
  setUrl: (url: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  refresh: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const WebPreviewContext = React.createContext<
  WebPreviewContextValue | undefined
>(undefined);

const useWebPreview = () => {
  const context = React.useContext(WebPreviewContext);
  if (!context) {
    throw new Error('useWebPreview must be used within a WebPreview');
  }
  return context;
};

interface WebPreviewProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultUrl?: string;
  onUrlChange?: (url: string) => void;
}

export function WebPreview({
  defaultUrl = '',
  onUrlChange,
  className,
  children,
  ...props
}: WebPreviewProps) {
  const [url, setUrlState] = React.useState(defaultUrl);
  const [history, setHistory] = React.useState<string[]>(
    [defaultUrl].filter(Boolean),
  );
  const [historyIndex, setHistoryIndex] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(false);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  const setUrl = React.useCallback(
    (newUrl: string) => {
      setUrlState(newUrl);
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), newUrl]);
      setHistoryIndex((prev) => prev + 1);
      onUrlChange?.(newUrl);
    },
    [historyIndex, onUrlChange],
  );

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const goBack = React.useCallback(() => {
    if (canGoBack) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setUrlState(history[newIndex]);
      onUrlChange?.(history[newIndex]);
    }
  }, [canGoBack, historyIndex, history, onUrlChange]);

  const goForward = React.useCallback(() => {
    if (canGoForward) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setUrlState(history[newIndex]);
      onUrlChange?.(history[newIndex]);
    }
  }, [canGoForward, historyIndex, history, onUrlChange]);

  const refresh = React.useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  const contextValue = React.useMemo(
    () => ({
      url,
      setUrl,
      canGoBack,
      canGoForward,
      goBack,
      goForward,
      refresh,
      isLoading,
      setIsLoading,
    }),
    [
      url,
      setUrl,
      canGoBack,
      canGoForward,
      goBack,
      goForward,
      refresh,
      isLoading,
    ],
  );

  return (
    <WebPreviewContext.Provider value={contextValue}>
      <div
        className={cn(
          'flex flex-col h-full border rounded-lg overflow-hidden',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </WebPreviewContext.Provider>
  );
}

interface WebPreviewNavigationProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export function WebPreviewNavigation({
  className,
  children,
  ...props
}: WebPreviewNavigationProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-2 border-b bg-gray-50 dark:bg-gray-900',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface WebPreviewNavigationButtonProps
  extends React.ComponentProps<typeof Button> {
  tooltip?: string;
}

export function WebPreviewNavigationButton({
  tooltip,
  children,
  ...props
}: WebPreviewNavigationButtonProps) {
  const button = (
    <Button variant="ghost" size="icon" className="h-8 w-8" {...props}>
      {children}
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}

interface WebPreviewUrlProps extends React.ComponentProps<typeof Input> {
  src?: string;
}

export function WebPreviewUrl({
  src,
  className,
  ...props
}: WebPreviewUrlProps) {
  const { url, setUrl } = useWebPreview();
  const [inputValue, setInputValue] = React.useState(url);

  React.useEffect(() => {
    if (src !== undefined) {
      setUrl(src);
      setInputValue(src);
    }
  }, [src, setUrl]);

  React.useEffect(() => {
    setInputValue(url);
  }, [url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUrl(inputValue);
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1">
      <Input
        type="url"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={() => setUrl(inputValue)}
        className={cn('h-8', className)}
        placeholder="Enter URL..."
        {...props}
      />
    </form>
  );
}

interface WebPreviewBodyProps
  extends Omit<React.IframeHTMLAttributes<HTMLIFrameElement>, 'loading'> {
  loadingIndicator?: React.ReactNode;
}

export function WebPreviewBody({
  src,
  loadingIndicator,
  className,
  onLoad,
  ...props
}: WebPreviewBodyProps) {
  const { url, setIsLoading } = useWebPreview();
  const iframeUrl = src || url;

  const handleLoad = (e: React.SyntheticEvent<HTMLIFrameElement, Event>) => {
    setIsLoading(false);
    onLoad?.(e);
  };

  React.useEffect(() => {
    if (iframeUrl) {
      setIsLoading(true);
    }
  }, [iframeUrl, setIsLoading]);

  return (
    <div className="relative flex-1">
      {loadingIndicator && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 z-10">
          {loadingIndicator}
        </div>
      )}
      <iframe
        src={iframeUrl}
        className={cn('w-full h-full border-0', className)}
        onLoad={handleLoad}
        {...props}
        style={{
          width: '100%',
          height: 400,
          border: '0',
          borderRadius: 4,
          overflow: 'hidden',
        }}
        allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
        sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
      />
    </div>
  );
}

// Export convenience navigation components
export function WebPreviewBackButton(props: WebPreviewNavigationButtonProps) {
  const { goBack, canGoBack } = useWebPreview();

  return (
    <WebPreviewNavigationButton
      onClick={goBack}
      disabled={!canGoBack}
      tooltip="Go back"
      {...props}
    >
      <ArrowLeft className="h-4 w-4" />
    </WebPreviewNavigationButton>
  );
}

export function WebPreviewForwardButton(
  props: WebPreviewNavigationButtonProps,
) {
  const { goForward, canGoForward } = useWebPreview();

  return (
    <WebPreviewNavigationButton
      onClick={goForward}
      disabled={!canGoForward}
      tooltip="Go forward"
      {...props}
    >
      <ArrowRight className="h-4 w-4" />
    </WebPreviewNavigationButton>
  );
}

export function WebPreviewRefreshButton(
  props: WebPreviewNavigationButtonProps,
) {
  const { refresh } = useWebPreview();

  return (
    <WebPreviewNavigationButton onClick={refresh} tooltip="Refresh" {...props}>
      <RefreshCw className="h-4 w-4" />
    </WebPreviewNavigationButton>
  );
}

export function WebPreviewExternalButton(
  props: WebPreviewNavigationButtonProps,
) {
  const { url } = useWebPreview();

  const handleOpen = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <WebPreviewNavigationButton
      onClick={handleOpen}
      disabled={!url}
      tooltip="Open in new tab"
      {...props}
    >
      <ExternalLink className="h-4 w-4" />
    </WebPreviewNavigationButton>
  );
}
