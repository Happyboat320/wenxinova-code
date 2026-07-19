import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

const AdaptPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    // Redirect to BookViewPage with adapt tab
    navigate(`/book/${id}?tab=adapt`, { replace: true });
  }, [id, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-xl">跳转中...</div>
    </div>
  );
};

export default AdaptPage;
