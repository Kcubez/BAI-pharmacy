import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { messagesApi, type MessagesParams } from "@/lib/api";
import { toast } from "sonner";

export function useMessages(params: MessagesParams = {}) {
  return useQuery({
    queryKey: ["messages", params],
    queryFn: () => messagesApi.list(params),
    refetchInterval: 5000, // Real-time: poll every 5 seconds
  });
}

export function useMessageStats() {
  return useQuery({
    queryKey: ["message-stats"],
    queryFn: () => messagesApi.stats(),
    refetchInterval: 10000, // Refresh stats every 10 seconds
  });
}

export function useDeleteMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => messagesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["message-stats"] });
      queryClient.invalidateQueries({ queryKey: ["senders"] });
      toast.success("Message deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete message");
    },
  });
}
