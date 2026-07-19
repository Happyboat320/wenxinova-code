import React, { useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";

const AdaptPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    // Redirect to BookViewPage with adapt tab
    const mode = location.pathname.endsWith('/script') ? '&mode=script' : '';
    navigate(`/book/${id}?tab=adapt${mode}`, { replace: true });
  }, [id, location.pathname, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-xl">跳转中...</div>
    </div>
  );
};

export default AdaptPage;
