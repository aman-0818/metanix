import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Cpu } from 'lucide-react';
import { apiService } from '@/lib/api';
import { useAuthStore } from '@/hooks/useAuthStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ModelPicker() {
  const { selectedModel, setSelectedModel, user } = useAuthStore();
  const {
    data: models = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['workspace-models', user?.id],
    queryFn: () => apiService.getLLMProviders(),
    staleTime: 60_000,
  });
  if (isError)
    return (
      <button onClick={() => refetch()} className="text-xs text-destructive">
        Retry loading models <ChevronDown className="inline w-3 h-3" />
      </button>
    );
  return (
    <Select
      value={selectedModel || ''}
      onValueChange={(name) => {
        const model = models.find((m) => m.name === name);
        if (model) setSelectedModel(model.name, model.id);
      }}
    >
      <SelectTrigger
        aria-label="Choose AI model"
        className="model-picker w-auto max-w-[240px] h-9 gap-2 border-0 bg-transparent shadow-none text-xs"
      >
        <Cpu size={14} className="shrink-0 text-primary" />
        <SelectValue placeholder={isLoading ? 'Loading models…' : 'Choose a model'}>
          {models.find((model) => model.name === selectedModel)?.display_name}
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" side="top" className="max-w-[calc(100vw-32px)]">
        {models.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No models available</p>
        )}
        {models.map((model) => (
          <SelectItem key={model.id} value={model.name} disabled={!model.is_active}>
            <span className="font-medium">{model.display_name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {model.is_active ? model.model_name : 'Unavailable'}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
